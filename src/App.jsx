import React, { useState, useEffect, useRef } from 'react';

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = { id: Date.now(), role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await fetch('https://victor-ia-orchestration-production.up.railway.app/api/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input })
      });
      const data = await res.json();
      const assistantMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        text: data.response || 'Sin respuesta'
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        text: `Error: ${err.message}`
      };
      setMessages(prev => [...prev, errorMsg]);
    }

    setSending(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#07090d', color: '#fff', fontFamily: 'sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid #222', background: '#0a0d12' }}>
        <h1 style={{ margin: 0, fontSize: '20px' }}>Victor IA Chat</h1>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: '40px', color: '#888' }}>
            <h2>Empieza una conversación</h2>
          </div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '60%',
              padding: '12px 16px',
              borderRadius: '8px',
              background: msg.role === 'user' ? '#0066ff' : '#222',
              wordWrap: 'break-word'
            }}
          >
            {msg.text}
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding: '16px', borderTop: '1px solid #222', background: '#0a0d12' }}>
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe un mensaje..."
            disabled={sending}
            style={{
              flex: 1,
              padding: '12px',
              border: '1px solid #333',
              borderRadius: '6px',
              background: '#1a1d24',
              color: '#fff',
              fontSize: '14px'
            }}
          />
          <button
            type="submit"
            disabled={sending}
            style={{
              padding: '12px 24px',
              background: sending ? '#666' : '#0066ff',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: sending ? 'not-allowed' : 'pointer',
              fontSize: '14px'
            }}
          >
            {sending ? 'Enviando...' : 'Enviar'}
          </button>
        </form>
      </div>
    </div>
  );
}