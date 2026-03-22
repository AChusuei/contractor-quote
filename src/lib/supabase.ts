import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null

export const PHOTOS_BUCKET = "quote-photos"

/**
 * Upload a photo to Supabase Storage under the given quoteSessionId folder.
 * Returns the storage path on success.
 */
export async function uploadQuotePhoto(
  quoteSessionId: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<string> {
  if (!supabase) {
    console.warn("Supabase not configured — skipping photo upload")
    // Simulate upload for dev/demo
    await new Promise<void>((resolve) => {
      let pct = 0
      const iv = setInterval(() => {
        pct = Math.min(pct + 20, 100)
        onProgress(pct)
        if (pct === 100) { clearInterval(iv); resolve() }
      }, 100)
    })
    return `${quoteSessionId}/${file.name}`
  }

  const path = `${quoteSessionId}/${Date.now()}-${file.name}`

  // Supabase JS v2 storage doesn't expose progress natively;
  // simulate a steady progress tick then resolve on completion.
  const progressInterval = setInterval(() => {
    onProgress(Math.min(80, Math.random() * 40 + 30))
  }, 200)

  const { error } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type })

  clearInterval(progressInterval)

  if (error) throw new Error(error.message)

  onProgress(100)
  return path
}
