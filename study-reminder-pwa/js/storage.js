/**
 * Storage Manager - IndexedDB/LocalStorage wrapper
 * Data persistence for StudyCat PWA
 */

const StorageManager = {
  DB_NAME: 'StudyCatDB',
  DB_VERSION: 2,
  db: null,

  // Store names
  STORES: {
    CONFIG: 'config',
    SUBJECTS: 'subjects',
    LOGS: 'studyLogs',
    CAT: 'catState',
    TIMER_SESSIONS: 'timerSessions'
  },

  /**
   * Initialize IndexedDB
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB open failed, falling back to LocalStorage');
        this.useLocalStorage = true;
        resolve();
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('IndexedDB initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores
        if (!db.objectStoreNames.contains(this.STORES.CONFIG)) {
          db.createObjectStore(this.STORES.CONFIG, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(this.STORES.SUBJECTS)) {
          db.createObjectStore(this.STORES.SUBJECTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(this.STORES.LOGS)) {
          const logStore = db.createObjectStore(this.STORES.LOGS, { keyPath: 'id' });
          logStore.createIndex('date', 'date', { unique: false });
          logStore.createIndex('subjectId', 'subjectId', { unique: false });
        }
        if (!db.objectStoreNames.contains(this.STORES.CAT)) {
          db.createObjectStore(this.STORES.CAT, { keyPath: 'id' });
        }
        // v2: Timer sessions store
        if (!db.objectStoreNames.contains(this.STORES.TIMER_SESSIONS)) {
          const timerStore = db.createObjectStore(this.STORES.TIMER_SESSIONS, { keyPath: 'id' });
          timerStore.createIndex('date', 'date', { unique: false });
          timerStore.createIndex('status', 'status', { unique: false });
        }
      };
    });
  },

  /**
   * Save data to a store
   */
  async save(storeName, data) {
    if (this.useLocalStorage) {
      localStorage.setItem(`studycat_${storeName}`, JSON.stringify(data));
      return true;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      // Handle both single item and array
      if (Array.isArray(data)) {
        // Clear existing data and add all
        store.clear();
        data.forEach(item => {
          if (!item.id) item.id = this.generateId();
          store.add(item);
        });
      } else {
        if (!data.id) data.id = 'main';
        store.put(data);
      }

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  },

  /**
   * Load data from a store
   */
  async load(storeName, defaultValue = null) {
    if (this.useLocalStorage) {
      const data = localStorage.getItem(`studycat_${storeName}`);
      return data ? JSON.parse(data) : defaultValue;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const result = request.result;
        if (result.length === 0) {
          resolve(defaultValue);
        } else if (result.length === 1 && result[0].id === 'main') {
          resolve(result[0]);
        } else {
          resolve(result);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Get single item by ID
   */
  async getById(storeName, id) {
    if (this.useLocalStorage) {
      const data = await this.load(storeName, []);
      return Array.isArray(data) ? data.find(item => item.id === id) : null;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Add single item to a store
   */
  async add(storeName, item) {
    if (!item.id) item.id = this.generateId();

    if (this.useLocalStorage) {
      const data = await this.load(storeName, []);
      data.push(item);
      await this.save(storeName, data);
      return item;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.add(item);

      request.onsuccess = () => resolve(item);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Update single item
   */
  async update(storeName, item) {
    if (this.useLocalStorage) {
      const data = await this.load(storeName, []);
      const index = data.findIndex(d => d.id === item.id);
      if (index >= 0) {
        data[index] = item;
        await this.save(storeName, data);
      }
      return item;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(item);

      request.onsuccess = () => resolve(item);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Delete item by ID
   */
  async delete(storeName, id) {
    if (this.useLocalStorage) {
      const data = await this.load(storeName, []);
      const filtered = data.filter(item => item.id !== id);
      await this.save(storeName, filtered);
      return true;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Get logs by date
   */
  async getLogsByDate(date) {
    if (this.useLocalStorage) {
      const logs = await this.load(this.STORES.LOGS, []);
      return logs.filter(log => log.date === date);
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.STORES.LOGS], 'readonly');
      const store = transaction.objectStore(this.STORES.LOGS);
      const index = store.index('date');
      const request = index.getAll(date);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Generate unique ID
   */
  generateId() {
    return Math.random().toString(36).substring(2, 10);
  },

  /**
   * Export all data as JSON
   */
  async exportData() {
    const config = await this.load(this.STORES.CONFIG, {});
    const subjects = await this.load(this.STORES.SUBJECTS, []);
    const logs = await this.load(this.STORES.LOGS, []);
    const cat = await this.load(this.STORES.CAT, {});
    const timerSessions = await this.load(this.STORES.TIMER_SESSIONS, []);

    return {
      exportDate: new Date().toISOString(),
      version: '2.0',
      config,
      subjects,
      logs,
      cat,
      timerSessions
    };
  },

  /**
   * Import data from JSON
   */
  async importData(data) {
    if (data.config) await this.save(this.STORES.CONFIG, data.config);
    if (data.subjects) await this.save(this.STORES.SUBJECTS, data.subjects);
    if (data.logs) await this.save(this.STORES.LOGS, data.logs);
    if (data.cat) await this.save(this.STORES.CAT, data.cat);
    if (data.timerSessions) await this.save(this.STORES.TIMER_SESSIONS, data.timerSessions);
    return true;
  },

  /**
   * Clear all data
   */
  async clearAll() {
    if (this.useLocalStorage) {
      Object.values(this.STORES).forEach(store => {
        localStorage.removeItem(`studycat_${store}`);
      });
      // Clear active timer from localStorage
      localStorage.removeItem('studycat_activeTimer');
      return true;
    }

    const transaction = this.db.transaction(Object.values(this.STORES), 'readwrite');
    Object.values(this.STORES).forEach(storeName => {
      transaction.objectStore(storeName).clear();
    });
    // Clear active timer from localStorage
    localStorage.removeItem('studycat_activeTimer');
    return true;
  },

  /**
   * Get timer sessions by date
   */
  async getTimerSessionsByDate(date) {
    if (this.useLocalStorage) {
      const sessions = await this.load(this.STORES.TIMER_SESSIONS, []);
      return sessions.filter(s => s.date === date);
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.STORES.TIMER_SESSIONS], 'readonly');
      const store = transaction.objectStore(this.STORES.TIMER_SESSIONS);
      const index = store.index('date');
      const request = index.getAll(date);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
};

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StorageManager;
}
