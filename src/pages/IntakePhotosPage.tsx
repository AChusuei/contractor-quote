import { useState, useCallback, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { FileUpload, type UploadFile } from "components"
import { Button } from "components"
import { uploadQuotePhoto, getQuotePhotos } from "@/lib/supabase"
import { attachPhotoSession } from "@/lib/quoteStore"
import { useQuoteContext } from "@/lib/QuoteContext"

const MAX_PHOTOS = 10
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB
const ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/heic": [".heic"],
}

/** Stable session key used as the Supabase folder for this quote draft */
function getQuoteSessionId(): string {
  const key = "cq_quote_session_id"
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    sessionStorage.setItem(key, id)
  }
  return id
}

export function IntakePhotosPage() {
  const navigate = useNavigate()
  const ctx = useQuoteContext()
  const readOnly = ctx?.readOnly ?? false
  const photoSessionId = ctx?.quote?.photoSessionId

  const [files, setFiles] = useState<UploadFile[]>([])
  const [photos, setPhotos] = useState<{ key: string; url: string }[]>([])
  const quoteSessionId = useRef(readOnly ? "" : getQuoteSessionId()).current
  if (!readOnly) attachPhotoSession(quoteSessionId)

  useEffect(() => {
    if (!readOnly || !photoSessionId) return
    let revoke: (() => void) | undefined
    getQuotePhotos(photoSessionId).then((results) => {
      const items = results.map(({ key, file }) => ({
        key,
        url: URL.createObjectURL(file),
      }))
      setPhotos(items)
      revoke = () => items.forEach(({ url }) => URL.revokeObjectURL(url))
    })
    return () => revoke?.()
  }, [readOnly, photoSessionId])

  const isUploading = files.some((f) => f.status === "uploading")
  const hasError = files.some((f) => f.status === "error")
  const atLimit = files.filter((f) => f.status !== "error").length >= MAX_PHOTOS

  const handleUpload = useCallback(
    async (file: File, onProgress: (pct: number) => void) => {
      await uploadQuotePhoto(quoteSessionId, file, onProgress)
    },
    [quoteSessionId]
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
        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photos uploaded.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map(({ key, url }) => (
              <a key={key} href={url} target="_blank" rel="noopener noreferrer">
                <img
                  src={url}
                  alt="Quote photo"
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
          {files.length === 0 && (
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
