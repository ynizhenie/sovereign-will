// What the device remembers between visits (localStorage), each thing under 'sovereign-will-<name>':
// settings as plain strings, data (saves, maps, presets, the sides) as JSON. A device that can't remember
// (private mode, storage full) just doesn't: loading gives the fallback, saving says false.

const key = name => `sovereign-will-${name}`;

export function loadSetting(name, fallback) {
  try { return localStorage.getItem(key(name)) || fallback; } catch (e) { return fallback; }
}

export function saveSetting(name, value) {
  try { localStorage.setItem(key(name), value); return true; } catch (e) { return false; }
}

export function loadData(name, fallback) {
  try { return JSON.parse(localStorage.getItem(key(name)) ?? 'null') ?? fallback; } catch (e) { return fallback; }
}

export function saveData(name, value) {
  try { localStorage.setItem(key(name), JSON.stringify(value)); return true; } catch (e) { return false; }
}

// ---- (#326, 30.10, 3) Big things (a save's game): in the device's database (IndexedDB), which has room for many,
// not in localStorage (a few MB in all: a big map's save or two filled it). Each call throws where there's no
// database (the caller keeps it the old way then)

const DB_NAME = 'sovereign-will', DB_STORE = 'blobs';
/** @type {Promise<IDBDatabase> | null} */
let dbOpening = null;
function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('no IndexedDB'));
  if (!dbOpening) {
    dbOpening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbOpening = null; reject(req.error); };
    });
  }
  return dbOpening;
}
/** @param {'readonly' | 'readwrite'} mode @param {(store: IDBObjectStore) => IDBRequest} act */
async function inStore(mode, act) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, mode), req = act(tx.objectStore(DB_STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error || req.error);
  });
}
/** @param {string} name @param {any} value */
export const putBig = (name, value) => inStore('readwrite', s => s.put(value, key(name)));
/** @param {string} name */
export const getBig = name => inStore('readonly', s => s.get(key(name)));
/** @param {string} name */
export const deleteBig = name => inStore('readwrite', s => s.delete(key(name)));
