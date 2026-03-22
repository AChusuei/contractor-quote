// TODO: wire to Cloudflare R2 (or similar) when storage is configured

export const PHOTOS_BUCKET = "quote-photos"

/**
 * Stub upload — simulates progress for dev/demo.
 * Replace with Cloudflare R2 implementation when ready.
 */
export async function uploadQuotePhoto(
  quoteSessionId: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<string> {
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
