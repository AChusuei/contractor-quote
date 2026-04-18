import { useState, useCallback, useEffect } from "react"
import { FileUpload, type UploadFile } from "components"
import { uploadQuotePhoto, getQuotePhotos, deleteQuotePhoto, type PhotoMeta } from "@/lib/supabase"

const MAX_PHOTOS = 10
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/heic": [".heic"],
}

export type PhotosFormState = {
  filesCount: number
  photosCount: number
  isUploading: boolean
}

type PhotosFormProps = {
  quoteId: string | null | undefined
  publicToken?: string
  readOnly: boolean
  onStateChange?: (state: PhotosFormState) => void
}

export function PhotosForm({ quoteId, publicToken, readOnly, onStateChange }: PhotosFormProps) {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [photos, setPhotos] = useState<PhotoMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  useEffect(() => {
    if (!quoteId) return
    let cancelled = false
    setLoading(true)

    getQuotePhotos(quoteId, { publicToken })
      .then((results) => {
        if (!cancelled) setPhotos(results)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [quoteId, publicToken])

  const isUploading = files.some((f) => f.status === "uploading")
  const hasError = files.some((f) => f.status === "error")
  const totalPhotos = photos.length + files.filter((f) => f.status !== "error").length
  const atLimit = totalPhotos >= MAX_PHOTOS

  useEffect(() => {
    onStateChange?.({
      filesCount: files.length,
      photosCount: photos.length,
      isUploading,
    })
  }, [files.length, photos.length, isUploading, onStateChange])

  const handleUpload = useCallback(
    async (file: File, onProgress: (pct: number) => void) => {
      if (!quoteId) return
      const photoId = await uploadQuotePhoto(quoteId, file, onProgress, { publicToken })
      setPhotos((prev) => [
        ...prev,
        {
          id: photoId,
          filename: file.name,
          contentType: file.type,
          size: file.size,
          url: `/api/v1/quotes/${encodeURIComponent(quoteId)}/photos/${encodeURIComponent(photoId)}/file${publicToken ? `?publicToken=${encodeURIComponent(publicToken)}` : ""}`,
        },
      ])
      setFiles((prev) => prev.filter((f) => f.file !== file))
    },
    [quoteId, publicToken]
  )

  const handleDelete = useCallback(
    async (photoId: string) => {
      if (!quoteId) return
      try {
        await deleteQuotePhoto(quoteId, photoId, { publicToken })
        setPhotos((prev) => prev.filter((p) => p.id !== photoId))
      } catch {
        // Best-effort — photo will still show but user can retry
      }
    },
    [quoteId, publicToken]
  )

  if (readOnly) {
    return (
      <div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading photos{'\u2026'}</p>
        ) : photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photos uploaded.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => (
              <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer">
                <img
                  src={photo.url}
                  alt={photo.filename}
                  className="rounded-md border aspect-square object-cover w-full hover:opacity-90 transition-opacity"
                />
              </a>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <FileUpload
        multiple
        accept={ACCEPT}
        maxSize={MAX_FILE_SIZE}
        onUpload={atLimit ? undefined : handleUpload}
        value={files}
        onChange={setFiles}
        disabled={atLimit}
      />

      {/* Previously uploaded photos */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <div key={photo.id} className="relative group">
              <img
                src={photo.url}
                alt={photo.filename}
                className={`rounded-md border aspect-square object-cover w-full transition-opacity ${confirmingId === photo.id ? "opacity-40" : ""}`}
              />
              {confirmingId === photo.id ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-md">
                  <p className="text-xs font-medium text-white drop-shadow">Remove photo?</p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => { void handleDelete(photo.id); setConfirmingId(null) }}
                      className="rounded bg-destructive px-2 py-0.5 text-xs text-white"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      className="rounded bg-white/80 px-2 py-0.5 text-xs text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingId(photo.id)}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Remove ${photo.filename}`}
                >
                  {'\u2715'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {atLimit && (
        <p className="text-xs text-muted-foreground text-center">
          Maximum of {MAX_PHOTOS} photos reached.
        </p>
      )}

      {hasError && (
        <p className="text-xs text-destructive">
          Some photos failed to upload. Remove them and try again, or continue without them.
        </p>
      )}
    </div>
  )
}

/** Expose upload state for parent components that need to know if uploads are in progress. */
export { MAX_PHOTOS }
