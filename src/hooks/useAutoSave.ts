import { useCallback, useRef, useState } from "react"

type SaveStatus = "idle" | "saving" | "saved" | "error"

/**
 * Debounced auto-save hook. Calls `saveFn` after `delay` ms of inactivity.
 * Returns a `trigger` function to call on field changes and a `flush` for
 * immediate save (e.g. on tab switch).
 */
export function useAutoSave(
  saveFn: () => Promise<void>,
  delay = 1500,
) {
  const [status, setStatus] = useState<SaveStatus>("idle")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)

  const doSave = useCallback(async () => {
    if (savingRef.current) return
    savingRef.current = true
    setStatus("saving")
    try {
      await saveFn()
      setStatus("saved")
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2000)
    } catch {
      setStatus("error")
      setTimeout(() => setStatus((s) => (s === "error" ? "idle" : s)), 3000)
    } finally {
      savingRef.current = false
    }
  }, [saveFn])

  const trigger = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(doSave, delay)
  }, [doSave, delay])

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    await doSave()
  }, [doSave])

  return { trigger, flush, status }
}
