const DB_NAME = "StudyPilotDB";
const DB_VERSION = 2;

const STORES = [
  "subjects",
  "tasks",
  "exams",
  "topics",
  "notes",
  "sessions"
];

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, {
            keyPath: "id",
            autoIncrement: true
          });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(store) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const request = tx.objectStore(store).getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function add(store, data) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const request = tx.objectStore(store).add({
      ...data,
      created_at: new Date().toISOString()
    });

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function update(store, data) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const request = tx.objectStore(store).put(data);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function remove(store, id) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const request = tx.objectStore(store).delete(Number(id));

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function replaceAll(data) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, "readwrite");

    for (const name of STORES) {
      const store = tx.objectStore(name);
      store.clear();

      for (const item of data[name] || []) {
        store.put(item);
      }
    }

    tx.oncomplete = () => {
      db.close();
      resolve();
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };

    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Import was cancelled."));
    };
  });
}

export async function exportAll() {
  const result = {};

  for (const name of STORES) {
    result[name] = await getAll(name);
  }

  return {
    app: "StudyPilot",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    data: result
  };
}

export async function initializeStorage() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction("subjects", "readwrite");
    const store = tx.objectStore("subjects");
    const countRequest = store.count();

    countRequest.onsuccess = () => {
      if (countRequest.result === 0) {
        store.add({
          name: "Mathematics",
          color: "#7868e6",
          created_at: new Date().toISOString()
        });

        store.add({
          name: "Science",
          color: "#269b83",
          created_at: new Date().toISOString()
        });
      }
    };

    tx.oncomplete = () => {
      db.close();
      resolve();
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
