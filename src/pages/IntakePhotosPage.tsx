import { useState, useCallback, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { FileUpload, type UploadFile } from "components"
import { Button } from "components"
import { uploadQuotePhoto, getQuotePhotos, deleteQuotePhoto, type PhotoMeta } from "@/lib/supabase"
import { useQuoteContext } from "@/lib/QuoteContext"

const MAX_PHOTOS = 10
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/heic": [".heic"],
}

/** Read quoteId and publicToken from sessionStorage (set during intake step 1). */
function getIntakeAuth(): { quoteId: string | null; publicToken: string | null } {
  return {
    quoteId: sessionStorage.getItem("cq_active_quote_id"),
    publicToken: sessionStorage.getItem("cq_public_token"),
  }
}

export function IntakePhotosPage() {
  const navigate = useNavigate()
  const ctx = useQuoteContext()
  const readOnly = ctx?.readOnly ?? false

  // For intake flow: use sessionStorage quoteId + publicToken
  // For admin view: use ctx.quote.id (Clerk auth handles the rest)
  const intakeAuth = !readOnly ? getIntakeAuth() : null
  const quoteId = readOnly ? ctx?.quote?.id : intakeAuth?.quoteId
  const publicToken = intakeAuth?.publicToken ?? undefined

  const [files, setFiles] = useState<UploadFile[]>([])
  const [photos, setPhotos] = useState<PhotoMeta[]>([])
  const [loading, setLoading] = useState(false)

  // Load existing photos on mount
  useEffect(() => {
    if (!quoteId) return
    let cancelled = false
    setLoading(true)

    getQuotePhotos(quoteId, { publicToken })
      .then((results) => {
        if (!cancelled) setPhotos(results)
      })
      .catch(() => {
        // Silently fail — photos are optional
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [quoteId, publicToken])

  const isUploading = files.some((f) => f.status === "uploading")
  const hasError = files.some((f) => f.status === "error")
  const totalPhotos = photos.length + files.filter((f) => f.status !== "error").length
  const atLimit = totalPhotos >= MAX_PHOTOS

  const handleUpload = useCallback(
    async (file: File, onProgress: (pct: number) => void) => {
      if (!quoteId) return
      const photoId = await uploadQuotePhoto(quoteId, file, onProgress, { publicToken })
      // Add to photos list so it shows immediately
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

  const handleContinue = () => {
    navigate("/intake/review")
  }

  const handleSkip = () => {
    navigate("/intake/review")
  }

  if (readOnly) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Photos</h1>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading photos…</p>
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
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Step 3 of 4</p>
        <h1 className="text-2xl font-semibold">Photos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload photos of your existing kitchen to help us give you a more accurate quote.
          Photos are optional — you can skip this step.
        </p>
      </div>

      <div className="space-y-4">
        {/* Previously uploaded photos */}
        {photos.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => (
              <div key={photo.id} className="relative group">
                <img
                  src={photo.url}
                  alt={photo.filename}
                  className="rounded-md border aspect-square object-cover w-full"
                />
                <button
                  type="button"
                  onClick={() => handleDelete(photo.id)}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Remove ${photo.filename}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <FileUpload
          multiple
          accept={ACCEPT}
          maxSize={MAX_FILE_SIZE}
          onUpload={atLimit ? undefined : handleUpload}
          onChange={setFiles}
          disabled={atLimit}
        />

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

        <div className="flex flex-col gap-2 pt-2">
          <Button
            onClick={handleContinue}
            disabled={isUploading}
            className="w-full"
          >
            {isUploading ? "Uploading…" : "Continue"}
          </Button>
          {files.length === 0 && photos.length === 0 && (
            <Button
              variant="ghost"
              onClick={handleSkip}
              className="w-full"
            >
              Skip — no photos
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
