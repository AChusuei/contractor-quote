import { useEffect, useRef } from "react"
import { apiPatch } from "@/lib/api"
import { getActiveDraft, touchDraft } from "@/lib/draftSession"

/**
 * Saves form data to the draft API when the user leaves the page
 * (tab switch, phone lock, browser back/forward, tab close).
 *
 * Uses visibilitychange (covers tab switch, phone lock, alt-tab)
 * and beforeunload (covers tab close, URL change).
 *
 * @param getPayload — function that returns the current form data to save.
 *                     Should return null if nothing to save.
 * @param target — "quote" or "customer" — determines which fields get sent.
 */
export function useSaveOnLeave(
  getPayload: () => Record<string, unknown> | null,
) {
  const payloadRef = useRef(getPayload)
  payloadRef.current = getPayload

  useEffect(() => {
    function save() {
      const contractorId = import.meta.env.VITE_CQ_CONTRACTOR_ID ?? "contractor-001"
      const draft = getActiveDraft(contractorId)
      if (!draft) return

      const payload = payloadRef.current()
      if (!payload) return

      // Use sendBeacon-style fire-and-forget — don't await
      const url = `/api/v1/quotes/${encodeURIComponent(draft.quoteId)}/draft`
      const body = JSON.stringify({ ...payload, publicToken: draft.publicToken })

      // navigator.sendBeacon is more reliable for unload events
      // but only supports POST. Fall back to fetch for PATCH.
      // Use keepalive to ensure the request completes even if the page unloads.
      fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).then(() => {
        touchDraft(contractorId)
      }).catch(() => {
        // Best effort — if it fails, the user can re-enter on next visit
      })
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        save()
      }
    }

    function handleBeforeUnload() {
      save()
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [])
}
