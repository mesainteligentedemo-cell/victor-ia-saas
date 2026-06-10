// ============================================================================
// STORAGE UTILITIES — localStorage + IndexedDB
// ============================================================================

const DB_NAME = 'victor-ia-chat';
const DB_VERSION = 1;
const STORE_NAME = 'conversations';

// localStorage helpers
export const loadHistory = () => {
  try {
    return JSON.parse(localStorage.getItem('chat-history') || '[]');
  } catch {
    return [];
  }
};

export const saveHistory = (messages) => {
  try {
    localStorage.setItem('chat-history', JSON.stringify(messages));
  } catch (e) {
    console.warn('localStorage quota exceeded:', e);
  }
};

export const clearHistory = () => {
  localStorage.removeItem('chat-history');
};

export const loadPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem('app-prefs') || '{}');
  } catch {
    return {};
  }
};

export const savePrefs = (prefs) => {
  try {
    localStorage.setItem('app-prefs', JSON.stringify(prefs));
  } catch (e) {
    console.warn('localStorage quota exceeded:', e);
  }
};

// IndexedDB helpers
let db = null;

const initDB = () => {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);

    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('project', 'project');
      }
    };
  });
};

export const saveConversation = async (id, messages, project) => {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({
      id,
      messages,
      project,
      timestamp: Date.now()
    });
    return new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch (e) {
    console.warn('IndexedDB save failed:', e);
  }
};

export const getConversation = async (id) => {
  try {
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const req = database.transaction(STORE_NAME).objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('IndexedDB get failed:', e);
    return null;
  }
};

export const getAllConversations = async () => {
  try {
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const req = database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('IndexedDB getAll failed:', e);
    return [];
  }
};