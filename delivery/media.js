// Shared by the launcher and its service worker. Blobs stay on this device.
function mediaDB() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('ut2k4-full-game-v1', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('files');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}
async function mediaGet(key) {
  const db = await mediaDB();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction('files').objectStore('files').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
async function mediaSave(entries) {
  const db = await mediaDB();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      for (const [key, value] of entries)
        tx.objectStore('files').put(value, key);
      tx.oncomplete = resolve;
      tx.onabort = tx.onerror = () =>
        reject(tx.error || Error('Browser storage unavailable'));
    });
  } finally {
    db.close();
  }
}
async function sha256(blob) {
  const sum = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(sum), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('');
}
