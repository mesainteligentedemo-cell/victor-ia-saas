/**
 * App.jsx — Victor IA chat application (main component).
 *
 * Layout:
 *   - Left  : Sidebar (280px desktop / drawer on mobile)
 *             logo · new-task · Agent/Plugins · tasks list · user card.
 *   - Main  : topbar (hamburger on mobile) · hero · messages · composer.
 *
 * Features integrated:
 *   1. localStorage     — chat history persisted + restored on mount.
 *   2. Task tracking    — per-message timestamps, duration, JSON export.
 *   3. Project detection— keyword routing (victor ia, costa negra, video, …).
 *   4. Voice input      — Web Speech API with graceful fallback.
 *   5. WebSocket        — ws://backend/ws/chat with auto-reconnect.
 *   6. HTTP fallback    — POST /api/chat with retry + backoff + 10s timeout.
 *   7. Demo mode        — simulated replies when the backend is unreachable.
 *   8. IndexedDB        — durable persistence of the full conversation.
 *   9. Analytics        — event tracking + CSV export.
 *
 * Streaming is CLIENT-SIDE: the full assistant response is obtained, then
 * revealed character-by-character with requestAnimationFrame.
 *
 * Framer Motion is used when available; if the package is absent the UI falls
 * back to plain elements (no hard dependency / no crash).
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  loadHistory,
  saveHistory,
  clearHistory as clearStoredHistory,
  saveConversation,
  loadPrefs,
  savePrefs,
} from './lib/storage.js';
import {
  track,
  downloadCSV as downloadAnalyticsCSV,
  getSummary,
} from './lib/analytics.js';
import { VoiceRecognizer, isVoiceSupported } from './lib/voice.js';
import { ReconnectingWebSocket } from './lib/websocket.js';

import { motion, AnimatePresence } from 'framer-motion';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const BACKEND_URL =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_BACKEND_URL) ||
  'https://victor-ia-orchestration-production.up.railway.app';

const WS_URL =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_WS_URL) ||
  `${BACKEND_URL}/ws/chat`;

const API_URL =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_API_URL) ||
  `${BACKEND_URL}/api/prompt`;

const STREAM_CHARS_PER_FRAME = 2; // reveal speed for the client-side streamer
const HTTP_TIMEOUT_MS = 10000; // 10s before giving up on a single attempt
const HTTP_MAX_RETRIES = 3; // attempts before falling back to demo mode
const WS_REPLY_TIMEOUT_MS = 8000;

const PROJECT_KEYWORDS = [
  { id: 'Victor IA', words: ['victor ia', 'victor-ia', 'nuestra web', 'nuestro sitio'] },
  { id: 'Costa Negra', words: ['costa negra', 'lotes', 'propiedades', 'quintana roo'] },
  { id: 'Seabird Hotel', words: ['seabird', 'hyatt', 'oceanside', 'resort'] },
  { id: 'ROES & CO', words: ['roes', 'plusvalia', 'inversionesconplusvalia'] },
  { id: 'Influence IA', words: ['influence ia', 'awards', 'premios web'] },
  { id: 'Brandbook', words: ['brandbook', 'manual de identidad', 'brand'] },
  { id: 'Dashboard BI', words: ['dashboard', 'kpis', 'analytics', 'métricas', 'metricas'] },
  { id: 'Video', words: ['video', 'kling', 'runway', 'lativa', 'after effects', 'spot'] },
];

/** Detect the most likely project from free text. */
function detectProject(text = '') {
  const lower = text.toLowerCase();
  for (const { id, words } of PROJECT_KEYWORDS) {
    if (words.some((w) => lower.includes(w))) return id;
  }
  return null;
}

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Demo mode (simulated replies)                                       */
/* ------------------------------------------------------------------ */

/** Deterministic, friendly simulated reply used when the backend is down. */
function demoReply(text) {
  const project = detectProject(text);
  const tag = project ? ` Detecté que esto es del proyecto **${project}**.` : '';
  return (
    `Modo demo activo — el backend está offline, pero sigo funcionando.${tag} ` +
    `Recibí: "${text.slice(0, 140)}". Tu conversación queda guardada localmente ` +
    `y se enviará al servidor cuando vuelva la conexión.`
  );
}

/* ------------------------------------------------------------------ */
/* Response source: WebSocket → HTTP (retry+timeout) → demo mode        */
/* ------------------------------------------------------------------ */

/** Single HTTP attempt with a hard timeout via AbortController. */
async function httpAttempt(text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(() => null);
    const reply = data && (data.reply || data.text || data.content);
    if (!reply) throw new Error('empty-reply');
    return reply;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve an assistant reply.
 * @returns {Promise<{reply:string, source:'ws'|'http'|'demo'}>}
 */
async function fetchAssistantReply(text, wsClient) {
  // 1) WebSocket round-trip if currently open.
  if (wsClient && wsClient.isOpen()) {
    console.info('[backend] Connecting via WebSocket…');
    const reply = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        off();
        resolve(null);
      }, WS_REPLY_TIMEOUT_MS);
      const off = wsClient.on('message', (data) => {
        if (data && (data.type === 'chat' || data.type === 'reply')) {
          clearTimeout(timeout);
          off();
          resolve(
            typeof data === 'string' ? data : data.text || data.content || ''
          );
        }
      });
      wsClient.send({ type: 'chat', text });
    });
    if (reply) {
      console.info('[backend] Backend OK (WebSocket)');
      return { reply, source: 'ws' };
    }
    console.warn('[backend] WebSocket timed out, trying HTTP…');
  }

  // 2) HTTP with retry + exponential backoff + per-attempt timeout.
  for (let attempt = 1; attempt <= HTTP_MAX_RETRIES; attempt += 1) {
    try {
      console.info(`[backend] Connecting to backend… (HTTP attempt ${attempt}/${HTTP_MAX_RETRIES})`);
      const reply = await httpAttempt(text);
      console.info('[backend] Backend OK (HTTP)');
      return { reply, source: 'http' };
    } catch (err) {
      const reason = err?.name === 'AbortError' ? 'timeout (10s)' : err?.message || 'error';
      console.warn(`[backend] HTTP attempt ${attempt} failed: ${reason}`);
      if (attempt < HTTP_MAX_RETRIES) {
        const backoff = 500 * 2 ** (attempt - 1); // 500ms, 1s, 2s…
        await sleep(backoff);
      }
    }
  }

  // 3) Demo mode fallback so the UI is always functional offline.
  console.warn('[backend] Fallback to demo — backend offline');
  return { reply: demoReply(text), source: 'demo' };
}

/* ================================================================== */
/* Component                                                           */
/* ================================================================== */

export default function App() {
  const prefs = useMemo(() => loadPrefs(), []);
  const [theme, setTheme] = useState(prefs.theme || 'dark');
  const [messages, setMessages] = useState([]);
  const [tasks, setTasks] = useState(() =>
    Array.isArray(prefs.tasks) ? prefs.tasks : []
  );
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [wsStatus, setWsStatus] = useState('idle');
  const [demoMode, setDemoMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [showStats, setShowStats] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer

  const conversationId = useRef(prefs.conversationId || uid());
  const wsRef = useRef(null);
  const recognizerRef = useRef(null);
  const rafRef = useRef(null);
  const scrollRef = useRef(null);
  const pendingSince = useRef(null);

  const voiceSupported = useMemo(() => isVoiceSupported, []);

  /* ---------------- theme ---------------- */
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    savePrefs({ theme });
  }, [theme]);

  /* ---------------- persist tasks ---------------- */
  useEffect(() => {
    savePrefs({ tasks });
  }, [tasks]);

  /* ---------------- restore on mount ---------------- */
  useEffect(() => {
    const restored = loadHistory();
    if (restored.length) {
      setMessages(restored);
      track('history_restored', { count: restored.length });
    }
    savePrefs({ conversationId: conversationId.current });
    track('app_open');
  }, []);

  /* ---------------- persist on change ---------------- */
  useEffect(() => {
    if (!messages.length) return;
    saveHistory(messages);
    saveConversation({
      id: conversationId.current,
      title: messages[0]?.text?.slice(0, 60) || 'Conversación',
      messages,
    });
  }, [messages]);

  /* ---------------- autoscroll ---------------- */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, interim]);

  /* ---------------- WebSocket lifecycle ---------------- */
  useEffect(() => {
    console.info('[backend] Connecting to backend… (WebSocket)');
    const client = new ReconnectingWebSocket(WS_URL);
    wsRef.current = client;
    const offStatus = client.on('status', (s) => {
      setWsStatus(s);
      if (s === 'open') {
        console.info('[backend] Backend OK (WebSocket connected)');
        setDemoMode(false);
      } else if (s === 'closed' || s === 'reconnecting') {
        console.warn(`[backend] WebSocket ${s}`);
      }
    });
    const offErr = client.on('error', (e) => {
      console.warn('[backend] WebSocket error:', e?.error || e);
    });
    client.connect();
    return () => {
      offStatus();
      offErr();
      client.close();
    };
  }, []);

  /* ---------------- voice lifecycle ---------------- */
  useEffect(() => {
    if (!voiceSupported) return undefined;
    const rec = new VoiceRecognizer({ lang: 'es-ES', interimResults: true });
    recognizerRef.current = rec;

    const offStart = rec.on('start', () => {
      setListening(true);
      track('voice_start');
    });
    const offResult = rec.on('result', ({ final, interim: intr }) => {
      setInterim(intr);
      if (final) {
        setInput((prev) => (prev ? `${prev} ${final}` : final).trim());
        setInterim('');
      }
    });
    const offEnd = rec.on('end', () => {
      setListening(false);
      setInterim('');
    });
    const offError = rec.on('error', ({ error }) => {
      setListening(false);
      setInterim('');
      track('voice_error', { error });
    });

    return () => {
      offStart();
      offResult();
      offEnd();
      offError();
      rec.abort();
    };
  }, [voiceSupported]);

  /* ---------------- cleanup RAF ---------------- */
  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  /* ---------------- client-side streaming ---------------- */
  const streamInto = useCallback((messageId, fullText) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    let index = 0;

    const step = () => {
      index = Math.min(fullText.length, index + STREAM_CHARS_PER_FRAME);
      const slice = fullText.slice(0, index);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, text: slice, streaming: index < fullText.length }
            : m
        )
      );
      if (index < fullText.length) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
        track('stream_complete', { chars: fullText.length });
      }
    };

    rafRef.current = requestAnimationFrame(step);
  }, []);

  /* ---------------- send ---------------- */
  const handleSend = useCallback(
    async (raw) => {
      const text = (raw ?? input).trim();
      if (!text || sending) return;

      const project = detectProject(text);
      const now = Date.now();
      pendingSince.current = now;

      const taskId = uid();
      const userMsg = {
        id: uid(),
        role: 'user',
        text,
        ts: now,
        project,
        taskId,
      };

      // Register a task entry for the sidebar.
      setTasks((prev) => [
        {
          id: taskId,
          title: text.slice(0, 60),
          project: project || null,
          ts: now,
        },
        ...prev,
      ].slice(0, 50));

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setInterim('');
      setSending(true);
      track('message_sent', { chars: text.length, project: project || 'none' });

      // Placeholder assistant message that will be streamed into.
      const assistantId = uid();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          text: '',
          ts: Date.now(),
          streaming: true,
          project,
        },
      ]);

      const { reply, source } = await fetchAssistantReply(text, wsRef.current);
      const duration = Date.now() - now;

      setDemoMode(source === 'demo');

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, durationMs: duration, source } : m
        )
      );
      track('reply_received', {
        durationMs: duration,
        chars: reply.length,
        source,
      });

      streamInto(assistantId, reply);
      setSending(false);
    },
    [input, sending, streamInto]
  );

  /* ---------------- voice toggle ---------------- */
  const toggleVoice = useCallback(() => {
    const rec = recognizerRef.current;
    if (!rec) return;
    if (listening) rec.stop();
    else rec.start();
  }, [listening]);

  /* ---------------- task export ---------------- */
  const exportTasks = useCallback(() => {
    const out = messages
      .filter((m) => m.role === 'user')
      .map((m) => ({
        id: m.id,
        text: m.text,
        project: m.project || 'none',
        startedAt: new Date(m.ts).toISOString(),
        durationMs:
          messages.find(
            (r) => r.role === 'assistant' && r.ts >= m.ts && r.durationMs
          )?.durationMs ?? null,
      }));
    const blob = new Blob([JSON.stringify(out, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'victoria-tasks.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
    track('tasks_exported', { count: out.length });
  }, [messages]);

  /* ---------------- new task / clear ---------------- */
  const handleNewTask = useCallback(() => {
    setMessages([]);
    clearStoredHistory();
    conversationId.current = uid();
    savePrefs({ conversationId: conversationId.current });
    setSidebarOpen(false);
    track('new_task');
  }, []);

  const deleteTask = useCallback((id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    track('task_deleted');
  }, []);

  const handleClear = useCallback(() => {
    setMessages([]);
    clearStoredHistory();
    conversationId.current = uid();
    savePrefs({ conversationId: conversationId.current });
    track('history_cleared');
  }, []);

  /* ---------------- derived ---------------- */
  const stats = useMemo(() => getSummary(), [messages, showStats]);
  const userCount = messages.filter((m) => m.role === 'user').length;

  /* ---------------- render ---------------- */
  return (
    <div className={`va-app va-theme-${theme}`} style={styles.app(theme)}>
      <style>{baseCSS}</style>

      {/* Mobile backdrop for the drawer */}
      {sidebarOpen && (
        <div
          style={styles.backdrop}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ---------------- Sidebar ---------------- */}
      <aside
        className={`va-sidebar${sidebarOpen ? ' va-sidebar-open' : ''}`}
        style={styles.sidebar(theme)}
        aria-label="Barra lateral"
      >
        <div style={styles.sidebarTop}>
          <div style={styles.logo}>
            <span style={styles.logoMark}>◆</span>
            <span style={styles.logoText}>
              victor <strong>AI</strong>
            </span>
          </div>

          <button
            type="button"
            style={styles.newTaskBtn(theme)}
            onClick={handleNewTask}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>＋</span>
            New task
          </button>

          <nav style={styles.nav}>
            <button type="button" style={styles.navItem(theme)}>
              <span style={styles.navIcon}>⊙</span> Agent
            </button>
            <button type="button" style={styles.navItem(theme)}>
              <span style={styles.navIcon}>⧉</span> Plugins
            </button>
          </nav>

          <div style={styles.tasksHeading}>Tasks</div>
          <div style={styles.tasksList}>
            {tasks.length === 0 && (
              <div style={styles.tasksEmpty(theme)}>Sin tareas todavía.</div>
            )}
            {tasks.map((t) => (
              <div key={t.id} style={styles.taskItem(theme)}>
                <span style={styles.taskText} title={t.title}>
                  {t.project && (
                    <span style={styles.taskProject(theme)}>{t.project}</span>
                  )}
                  {t.title || 'Tarea'}
                </span>
                <button
                  type="button"
                  style={styles.taskDelete(theme)}
                  onClick={() => deleteTask(t.id)}
                  aria-label="Eliminar tarea"
                  title="Eliminar"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.userCard(theme)}>
          <div style={styles.avatar}>V</div>
          <div style={styles.userMeta}>
            <strong style={{ fontSize: 13 }}>Victor IA</strong>
            <span style={styles.userSub}>mesainteligentedemo</span>
          </div>
        </div>
      </aside>

      {/* ---------------- Main ---------------- */}
      <div style={styles.main}>
        {/* Topbar */}
        <header style={styles.topbar(theme)}>
          <button
            type="button"
            className="va-hamburger"
            style={styles.hamburger(theme)}
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label="Abrir menú"
            title="Menú"
          >
            ☰
          </button>
          <div style={styles.brand}>
            <span
              style={styles.dot(wsStatus)}
              title={`WebSocket: ${wsStatus}`}
            />
            <strong>Victor IA</strong>
            <span style={styles.sub}>chat</span>
          </div>
          <div style={styles.actions}>
            <button
              type="button"
              style={styles.iconBtn(theme)}
              onClick={() => setShowStats((s) => !s)}
              aria-label="Estadísticas"
              title="Estadísticas"
            >
              ▦
            </button>
            <button
              type="button"
              style={styles.iconBtn(theme)}
              onClick={exportTasks}
              aria-label="Exportar tareas"
              title="Exportar tareas (JSON)"
            >
              ⤓
            </button>
            <button
              type="button"
              style={styles.iconBtn(theme)}
              onClick={() => downloadAnalyticsCSV()}
              aria-label="Exportar analytics CSV"
              title="Exportar analytics (CSV)"
            >
              CSV
            </button>
            <button
              type="button"
              style={styles.iconBtn(theme)}
              onClick={handleClear}
              aria-label="Limpiar conversación"
              title="Limpiar"
            >
              ⌫
            </button>
            <button
              type="button"
              style={styles.iconBtn(theme)}
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label="Cambiar tema"
              title="Tema"
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </div>
        </header>

        {/* Demo-mode banner */}
        {demoMode && (
          <div style={styles.demoBanner} role="status">
            ⚠ Demo mode — backend offline. Respuestas simuladas; tu chat se
            guarda localmente.
          </div>
        )}

        {/* Stats */}
        {showStats && (
          <div
            style={styles.stats(theme)}
            role="region"
            aria-label="Estadísticas"
          >
            <span>Mensajes: {userCount}</span>
            {Object.entries(stats).map(([k, v]) => (
              <span key={k} style={styles.statPill(theme)}>
                {k}: {v}
              </span>
            ))}
          </div>
        )}

        {/* Thread */}
        <main ref={scrollRef} style={styles.thread} aria-live="polite">
          {messages.length === 0 && (
            <div style={styles.hero(theme)}>
              <h1 style={styles.heroTitle}>What can I do for you?</h1>
              <p style={styles.heroSub(theme)}>
                Empieza una conversación. Tu historial se guarda automáticamente
                en este navegador.
              </p>
            </div>
          )}

          <AnimatePresence>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={styles.row(m.role)}
              >
                <div style={styles.bubble(m.role, theme)}>
                  {m.project && (
                    <span style={styles.projectTag(theme)}>{m.project}</span>
                  )}
                  <span>{m.text}</span>
                  {m.streaming && <span style={styles.caret}>▍</span>}
                  {m.role === 'assistant' && m.durationMs != null && (
                    <span style={styles.meta}>
                      {(m.durationMs / 1000).toFixed(2)}s
                      {m.source === 'demo' ? ' · demo' : ''}
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </main>

        {/* Composer */}
        <footer style={styles.composer(theme)}>
          {interim && <div style={styles.interim}>{interim}</div>}
          <form
            style={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            {voiceSupported && (
              <button
                type="button"
                onClick={toggleVoice}
                style={styles.micBtn(listening, theme)}
                aria-pressed={listening}
                aria-label={listening ? 'Detener dictado' : 'Dictar por voz'}
                title={listening ? 'Detener dictado' : 'Dictar por voz'}
              >
                {listening ? '◉' : '🎙'}
              </button>
            )}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Escribe un mensaje…"
              rows={1}
              style={styles.textarea(theme)}
              aria-label="Mensaje"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              style={styles.sendBtn(theme, sending || !input.trim())}
              aria-label="Enviar"
            >
              {sending ? '…' : '➤'}
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const palette = (theme) =>
  theme === 'dark'
    ? {
        bg: '#0b0b0f',
        panel: '#14141b',
        sidebar: '#101017',
        border: '#26262f',
        text: '#f4f4f6',
        sub: '#9a9aa6',
        userBubble: '#3b82f6',
        botBubble: '#1c1c26',
        accent: '#3b82f6',
        hover: '#1c1c26',
      }
    : {
        bg: '#f7f7f9',
        panel: '#ffffff',
        sidebar: '#f0f0f4',
        border: '#e4e4ea',
        text: '#16161a',
        sub: '#6b6b76',
        userBubble: '#2563eb',
        botBubble: '#ececf1',
        accent: '#2563eb',
        hover: '#e8e8ee',
      };

const SIDEBAR_W = 280;

const styles = {
  app: (t) => {
    const p = palette(t);
    return {
      display: 'flex',
      height: '100dvh',
      maxHeight: '100dvh',
      background: p.bg,
      color: p.text,
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    };
  },

  /* ---- backdrop (mobile drawer) ---- */
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 40,
  },

  /* ---- sidebar ---- */
  sidebar: (t) => {
    const p = palette(t);
    return {
      width: SIDEBAR_W,
      minWidth: SIDEBAR_W,
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      background: p.sidebar,
      borderRight: `1px solid ${p.border}`,
      padding: '16px 12px',
      zIndex: 50,
    };
  },
  sidebarTop: { display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 8px 14px',
  },
  logoMark: { color: '#3b82f6', fontSize: 16 },
  logoText: { fontSize: 17, letterSpacing: 0.2 },
  newTaskBtn: (t) => {
    const p = palette(t);
    return {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      width: '100%',
      padding: '10px 12px',
      borderRadius: 10,
      border: `1px solid ${p.border}`,
      background: p.accent,
      color: '#fff',
      fontSize: 14,
      fontWeight: 600,
      cursor: 'pointer',
      marginBottom: 14,
    };
  },
  nav: { display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 },
  navItem: (t) => {
    const p = palette(t);
    return {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      width: '100%',
      padding: '9px 10px',
      borderRadius: 8,
      border: 'none',
      background: 'transparent',
      color: p.text,
      fontSize: 14,
      textAlign: 'left',
      cursor: 'pointer',
    };
  },
  navIcon: { fontSize: 15, width: 18, textAlign: 'center', opacity: 0.85 },
  tasksHeading: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    opacity: 0.55,
    padding: '4px 10px 8px',
  },
  tasksList: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  tasksEmpty: (t) => ({
    fontSize: 13,
    color: palette(t).sub,
    padding: '6px 10px',
  }),
  taskItem: (t) => {
    const p = palette(t);
    return {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '8px 10px',
      borderRadius: 8,
      fontSize: 13,
      color: p.text,
    };
  },
  taskText: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  taskProject: (t) => ({
    fontSize: 10,
    fontWeight: 700,
    color: palette(t).accent,
    flexShrink: 0,
  }),
  taskDelete: (t) => {
    const p = palette(t);
    return {
      border: 'none',
      background: 'transparent',
      color: p.sub,
      cursor: 'pointer',
      fontSize: 12,
      padding: 2,
      lineHeight: 1,
      flexShrink: 0,
    };
  },
  userCard: (t) => {
    const p = palette(t);
    return {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px',
      borderRadius: 10,
      border: `1px solid ${p.border}`,
      background: p.panel,
    };
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    background: '#3b82f6',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    flexShrink: 0,
  },
  userMeta: { display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  userSub: { fontSize: 11, opacity: 0.6 },

  /* ---- main column ---- */
  main: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
  },
  topbar: (t) => {
    const p = palette(t);
    return {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '12px 16px',
      borderBottom: `1px solid ${p.border}`,
      background: p.panel,
    };
  },
  hamburger: (t) => {
    const p = palette(t);
    return {
      background: 'transparent',
      border: `1px solid ${p.border}`,
      color: p.text,
      borderRadius: 8,
      padding: '6px 10px',
      cursor: 'pointer',
      fontSize: 16,
      lineHeight: 1,
    };
  },
  brand: { display: 'flex', alignItems: 'center', gap: 8 },
  sub: { color: '#9a9aa6', fontSize: 13 },
  dot: (status) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
    background:
      status === 'open'
        ? '#22c55e'
        : status === 'connecting' || status === 'reconnecting'
        ? '#eab308'
        : '#ef4444',
  }),
  actions: { display: 'flex', gap: 6, marginLeft: 'auto' },
  iconBtn: (t) => {
    const p = palette(t);
    return {
      background: 'transparent',
      border: `1px solid ${p.border}`,
      color: p.text,
      borderRadius: 8,
      padding: '6px 10px',
      cursor: 'pointer',
      fontSize: 13,
      lineHeight: 1,
    };
  },

  /* ---- demo banner ---- */
  demoBanner: {
    padding: '8px 16px',
    background: '#7c2d12',
    color: '#fed7aa',
    fontSize: 13,
    textAlign: 'center',
    borderBottom: '1px solid #9a3412',
  },

  stats: (t) => {
    const p = palette(t);
    return {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      padding: '8px 16px',
      borderBottom: `1px solid ${p.border}`,
      background: p.panel,
      fontSize: 12,
      color: p.sub,
    };
  },
  statPill: (t) => ({
    background: palette(t).botBubble,
    padding: '2px 8px',
    borderRadius: 999,
  }),

  thread: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  hero: (t) => ({
    margin: 'auto',
    textAlign: 'center',
    color: palette(t).text,
    maxWidth: 520,
    padding: '0 16px',
  }),
  heroTitle: {
    fontSize: 30,
    fontWeight: 700,
    margin: '0 0 10px',
    letterSpacing: -0.5,
  },
  heroSub: (t) => ({
    fontSize: 14,
    color: palette(t).sub,
    margin: 0,
    lineHeight: 1.5,
  }),
  row: (role) => ({
    display: 'flex',
    justifyContent: role === 'user' ? 'flex-end' : 'flex-start',
  }),
  bubble: (role, t) => {
    const p = palette(t);
    return {
      maxWidth: '76%',
      padding: '10px 14px',
      borderRadius: 16,
      background: role === 'user' ? p.userBubble : p.botBubble,
      color: role === 'user' ? '#fff' : p.text,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      position: 'relative',
      lineHeight: 1.45,
    };
  },
  projectTag: (t) => ({
    display: 'block',
    fontSize: 11,
    fontWeight: 700,
    opacity: 0.85,
    marginBottom: 4,
    color: palette(t).accent,
  }),
  caret: { animation: 'va-blink 1s steps(2) infinite', marginLeft: 1 },
  meta: { display: 'block', fontSize: 10, opacity: 0.55, marginTop: 4 },

  composer: (t) => {
    const p = palette(t);
    return {
      borderTop: `1px solid ${p.border}`,
      background: p.panel,
      padding: '10px 12px',
    };
  },
  interim: { fontSize: 13, color: '#9a9aa6', padding: '0 4px 6px' },
  form: { display: 'flex', alignItems: 'flex-end', gap: 8 },
  micBtn: (active, t) => {
    const p = palette(t);
    return {
      border: `1px solid ${active ? p.accent : p.border}`,
      background: active ? p.accent : 'transparent',
      color: active ? '#fff' : p.text,
      borderRadius: 10,
      width: 42,
      height: 42,
      cursor: 'pointer',
      fontSize: 16,
      flexShrink: 0,
    };
  },
  textarea: (t) => {
    const p = palette(t);
    return {
      flex: 1,
      resize: 'none',
      maxHeight: 140,
      padding: '11px 14px',
      borderRadius: 12,
      border: `1px solid ${p.border}`,
      background: p.bg,
      color: p.text,
      fontSize: 15,
      lineHeight: 1.4,
      fontFamily: 'inherit',
      outline: 'none',
    };
  },
  sendBtn: (t, disabled) => {
    const p = palette(t);
    return {
      border: 'none',
      background: disabled ? p.border : p.accent,
      color: '#fff',
      borderRadius: 10,
      width: 42,
      height: 42,
      cursor: disabled ? 'default' : 'pointer',
      fontSize: 16,
      flexShrink: 0,
    };
  },
};

const baseCSS = `
  @keyframes va-blink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
  * { box-sizing: border-box; }
  body { margin: 0; }
  .va-app textarea::placeholder { color: #9a9aa6; }
  .va-app button:focus-visible,
  .va-app textarea:focus-visible { outline: 2px solid #3b82f6; outline-offset: 1px; }

  /* Hamburger hidden on desktop, sidebar always visible */
  .va-hamburger { display: none; }

  /* Mobile: sidebar becomes an off-canvas drawer */
  @media (max-width: 768px) {
    .va-hamburger { display: inline-block; }
    .va-sidebar {
      position: fixed;
      top: 0;
      left: 0;
      transform: translateX(-100%);
      transition: transform 0.25s ease;
      box-shadow: 0 0 40px rgba(0,0,0,0.4);
    }
    .va-sidebar-open { transform: translateX(0); }
  }
`;