// Storage provider: 'local' uses IndexedDB (dev default), 'api' uses the backend API + R2.
// Controlled by VITE_CQ_STORAGE_PROVIDER env var.

import { apiUpload, apiGet, api } from "./api"

export const PHOTOS_BUCKET = "quote-photos"

const STORAGE_PROVIDER = import.meta.env.VITE_CQ_STORAGE_PROVIDER ?? "local"

// ── IndexedDB helpers (fallback for dev without wrangler) ─────────────────

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

async function idbDelete(key: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const req = tx.objectStore(STORE_NAME).delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// ── API types ─────────────────────────────────────────────────────────────

export type PhotoMeta = {
  id: string
  filename: string
  contentType: string
  size: number
  url: string
  createdAt?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────

function tokenParam(publicToken?: string): string {
  return publicToken ? `?publicToken=${encodeURIComponent(publicToken)}` : ""
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Upload a photo for the given quote.
 * - provider=api: POST to /quotes/:quoteId/photos with publicToken or Clerk auth
 * - provider=local: writes to IndexedDB
 * Returns the photo ID (api) or storage key (local).
 */
export async function uploadQuotePhoto(
  quoteIdOrSessionId: string,
  file: File,
  onProgress: (pct: number) => void,
  opts?: { publicToken?: string }
): Promise<string> {
  if (STORAGE_PROVIDER === "api") {
    onProgress(10)
    const formData = new FormData()
    formData.append("file", file)

    const res = await apiUpload<{ id: string }>(
      `/quotes/${encodeURIComponent(quoteIdOrSessionId)}/photos${tokenParam(opts?.publicToken)}`,
      formData
    )
    onProgress(100)

    if (!res.ok) {
      throw new Error(res.error)
    }
    return res.data.id
  }

  if (STORAGE_PROVIDER === "local") {
    const key = idbKey(quoteIdOrSessionId, file.name)
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
 * Retrieve all photos for a quote.
 * - provider=api: GET /quotes/:quoteId/photos
 * - provider=local: reads from IndexedDB (returns File objects)
 */
export async function getQuotePhotos(
  quoteIdOrSessionId: string,
  opts?: { publicToken?: string }
): Promise<PhotoMeta[]> {
  if (STORAGE_PROVIDER === "api") {
    const res = await apiGet<{ photos: PhotoMeta[] }>(
      `/quotes/${encodeURIComponent(quoteIdOrSessionId)}/photos${tokenParam(opts?.publicToken)}`
    )
    if (!res.ok) return []
    return res.data.photos
  }

  if (STORAGE_PROVIDER === "local") {
    const items = await idbGetAll(quoteIdOrSessionId)
    return items.map(({ key, file }) => ({
      id: key,
      filename: file.name,
      contentType: file.type,
      size: file.size,
      url: URL.createObjectURL(file),
    }))
  }

  return []
}

/**
 * Delete a photo.
 * - provider=api: DELETE /quotes/:quoteId/photos/:photoId
 * - provider=local: deletes from IndexedDB by key
 */
export async function deleteQuotePhoto(
  quoteIdOrSessionId: string,
  photoIdOrKey: string,
  opts?: { publicToken?: string }
): Promise<void> {
  if (STORAGE_PROVIDER === "api") {
    const res = await api<void>(
      "DELETE",
      `/quotes/${encodeURIComponent(quoteIdOrSessionId)}/photos/${encodeURIComponent(photoIdOrKey)}${tokenParam(opts?.publicToken)}`
    )
    if (!res.ok) {
      throw new Error(res.error)
    }
    return
  }

  if (STORAGE_PROVIDER === "local") {
    await idbDelete(photoIdOrKey)
    return
  }
}
