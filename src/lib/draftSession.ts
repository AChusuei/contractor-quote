/**
 * Manages the active quote draft session, keyed per contractor.
 *
 * Uses localStorage so the draft survives tab closes and page refreshes.
 * Each draft has a TTL (default 7 days) — if the user returns after that,
 * they start fresh. Within the TTL, navigating back and forth reuses the
 * same quote ID instead of creating duplicates.
 *
 * Keyed by contractor ID so a customer browsing multiple contractor sites
 * in the same browser maintains separate drafts for each.
 */

const DRAFT_KEY_PREFIX = "cq_draft:"
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function draftKey(contractorId: string): string {
  return `${DRAFT_KEY_PREFIX}${contractorId}`
}

interface DraftSession {
  quoteId: string
  publicToken: string
  contractorId: string
  updatedAt: number // Date.now()
}

export function getActiveDraft(contractorId: string): DraftSession | null {
  try {
    const raw = localStorage.getItem(draftKey(contractorId))
    if (!raw) return null
    const draft: DraftSession = JSON.parse(raw)
    // Expired?
    if (Date.now() - draft.updatedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(draftKey(contractorId))
      return null
    }
    return draft
  } catch {
    localStorage.removeItem(draftKey(contractorId))
    return null
  }
}

export function saveDraft(quoteId: string, publicToken: string, contractorId: string): void {
  const draft: DraftSession = {
    quoteId,
    publicToken,
    contractorId,
    updatedAt: Date.now(),
  }
  localStorage.setItem(draftKey(contractorId), JSON.stringify(draft))
}

export function touchDraft(contractorId: string): void {
  const draft = getActiveDraft(contractorId)
  if (draft) {
    draft.updatedAt = Date.now()
    localStorage.setItem(draftKey(contractorId), JSON.stringify(draft))
  }
}

export function clearDraft(contractorId: string): void {
  localStorage.removeItem(draftKey(contractorId))
}
