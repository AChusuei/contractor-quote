import { useEffect, useRef } from "react"

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
 * @param contractorId — the contractor ID to look up the active draft.
 */
export function useSaveOnLeave(
  getPayload: () => Record<string, unknown> | null,
  contractorId: string,
) {
  const payloadRef = useRef(getPayload)
  payloadRef.current = getPayload

  const contractorIdRef = useRef(contractorId)
  contractorIdRef.current = contractorId

  useEffect(() => {
    function save() {
      const cid = contractorIdRef.current
      if (!cid) return
      const draft = getActiveDraft(cid)
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
        touchDraft(cid)
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
