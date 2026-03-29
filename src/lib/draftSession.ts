/**
 * Manages the active quote draft session.
 *
 * Uses localStorage so the draft survives tab closes and page refreshes.
 * Each draft has a TTL (default 7 days) — if the user returns after that,
 * they start fresh. Within the TTL, navigating back and forth reuses the
 * same quote ID instead of creating duplicates.
 */

const DRAFT_KEY = "cq_draft"
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

interface DraftSession {
  quoteId: string
  publicToken: string
  contractorId: string
  updatedAt: number // Date.now()
}

export function getActiveDraft(): DraftSession | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const draft: DraftSession = JSON.parse(raw)
    // Expired?
    if (Date.now() - draft.updatedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(DRAFT_KEY)
      return null
    }
    return draft
  } catch {
    localStorage.removeItem(DRAFT_KEY)
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
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
}

export function touchDraft(): void {
  const draft = getActiveDraft()
  if (draft) {
    draft.updatedAt = Date.now()
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  }
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY)
}
