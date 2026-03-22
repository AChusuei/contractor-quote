// Storage provider: 'local' uses IndexedDB (dev default), future providers can use R2 etc.
// Controlled by VITE_CQ_STORAGE_PROVIDER env var.

export const PHOTOS_BUCKET = "quote-photos"

const STORAGE_PROVIDER = import.meta.env.VITE_CQ_STORAGE_PROVIDER ?? "local"

// ── IndexedDB helpers ──────────────────────────────────────────────────────────

const DB_NAME = "cq_photo_store"
const DB_VERSION = 1
const STORE_NAME = "photos"

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbKey(sessionId: string, fileName: string): string {
  return `${sessionId}/${fileName}`
}

async function idbPut(key: string, file: File): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const req = tx.objectStore(STORE_NAME).put(file, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function idbGetAll(sessionId: string): Promise<{ key: string; file: File }[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const store = tx.objectStore(STORE_NAME)
    const results: { key: string; file: File }[] = []

    const prefix = `${sessionId}/`
    const range = IDBKeyRange.bound(prefix, prefix + "\uffff")
    const req = store.openCursor(range)

    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        results.push({ key: cursor.key as string, file: cursor.value as File })
        cursor.continue()
      } else {
        resolve(results)
      }
    }
    req.onerror = () => reject(req.error)
  })
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Upload a photo for the given quote session.
 * With VITE_CQ_STORAGE_PROVIDER=local (or unset) writes to IndexedDB.
 * Returns the storage key for the file.
 */
export async function uploadQuotePhoto(
  quoteSessionId: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<string> {
  if (STORAGE_PROVIDER === "local") {
    const key = idbKey(quoteSessionId, file.name)
    onProgress(50)
    await idbPut(key, file)
    onProgress(100)
    return key
  }

  throw new Error(
    `Unknown storage provider: "${STORAGE_PROVIDER}". Set VITE_CQ_STORAGE_PROVIDER to a supported value.`
  )
}

/**
 * Retrieve all photos stored for a given quote session.
 * Only available with the 'local' provider (returns empty array otherwise).
 */
export async function getQuotePhotos(
  quoteSessionId: string
): Promise<{ key: string; file: File }[]> {
  if (STORAGE_PROVIDER === "local") {
    return idbGetAll(quoteSessionId)
  }
  return []
}
