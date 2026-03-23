import { useState, useEffect, useRef, useCallback } from "react"
import { useParams, Link } from "react-router-dom"
import { useAuth } from "@clerk/clerk-react"
import { Button } from "components"
import {
  getQuote,
  updateQuote,
  updateStatus,
  updateNotes,
  type Quote,
  type QuoteStatus,
} from "@/lib/quoteStore"
import { fetchQuotes } from "@/lib/quotes"
import { cn } from "@/lib/utils"
import { QuoteProvider } from "@/lib/QuoteContext"
import { IntakePage } from "@/pages/IntakePage"
import { IntakeScreen2Page } from "@/pages/IntakeScreen2Page"
import { IntakePhotosPage } from "@/pages/IntakePhotosPage"
import { apiGet, apiPatch, apiPost, isNetworkError, setAuthProvider } from "@/lib/api"

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<QuoteStatus, string> = {
  lead: "Lead",
  measure_scheduled: "Measure scheduled",
  quoted: "Quoted",
  accepted: "Accepted",
  rejected: "Rejected",
}

const STATUS_COLORS: Record<QuoteStatus, string> = {
  lead: "rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800",
  measure_scheduled: "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800",
  quoted: "rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800",
  accepted: "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800",
  rejected: "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800",
}

const ALL_STATUSES: QuoteStatus[] = ["lead", "measure_scheduled", "quoted", "accepted", "rejected"]

/** Map API quote response to the frontend Quote type */
function mapApiQuote(raw: Record<string, unknown>): Quote {
  const scope = raw.scope as Quote["scope"] | null
  return {
    id: raw.id as string,
    createdAt: raw.createdAt as string,
    name: raw.name as string,
    email: raw.email as string,
    phone: raw.phone as string,
    cell: (raw.cell as string) ?? undefined,
    jobSiteAddress: raw.jobSiteAddress as string,
    propertyType: raw.propertyType as Quote["propertyType"],
    budgetRange: raw.budgetRange as Quote["budgetRange"],
    howDidYouFindUs: (raw.howDidYouFindUs as string) ?? "",
    referredByContractor: (raw.referredByContractor as string) ?? undefined,
    scope: scope ?? undefined,
    quotePath: (raw.quotePath as Quote["quotePath"]) ?? undefined,
    photoSessionId: (raw.photoSessionId as string) ?? undefined,
    status: raw.status as QuoteStatus,
    statusHistory: (raw.statusHistory as Quote["statusHistory"]) ?? [],
    contractorNotes: (raw.contractorNotes as string) ?? "",
  }
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-foreground border-b pb-2 mb-4">{children}</h3>
  )
}

function StatusBadge({ status }: { status: QuoteStatus }) {
  return <span className={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</span>
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type TabId = "contact" | "scope" | "photos"

const TABS: { id: TabId; label: string }[] = [
  { id: "contact", label: "Contact & Project" },
  { id: "scope", label: "Project Scope" },
  { id: "photos", label: "Photos" },
]

// ---------------------------------------------------------------------------
// Status panel
// ---------------------------------------------------------------------------

function StatusPanel({
  quote,
  onStatusChange,
}: {
  quote: Quote
  onStatusChange: (status: QuoteStatus) => void
}) {
  const others = ALL_STATUSES.filter((s) => s !== quote.status)
  return (
    <div>
      <SectionHeading>Update status</SectionHeading>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Current:</span>
        <StatusBadge status={quote.status} />
      </div>
      <div className="flex flex-wrap gap-2">
        {others.map((s) => (
          <button
            key={s}
            onClick={() => onStatusChange(s)}
            className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
          >
            &rarr; {STATUS_LABELS[s]}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status timeline
// ---------------------------------------------------------------------------

function StatusTimeline({ quote }: { quote: Quote }) {
  return (
    <div>
      <SectionHeading>Status timeline</SectionHeading>
      <ol className="space-y-3">
        {quote.statusHistory.map((event, i) => (
          <li key={i} className="flex items-start gap-3">
            <div className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
            <div>
              <p className="text-sm font-medium">{STATUS_LABELS[event.status]}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(event.timestamp)}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Contractor notes
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Delete customer data
// ---------------------------------------------------------------------------

function DeleteCustomerDataPanel({ quote, onDeleted }: { quote: Quote; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { getToken } = useAuth()

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(
        `/api/v1/customers/${encodeURIComponent(quote.email)}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ requestType: "contractor" }),
        }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `Delete failed (${res.status})`)
      }
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred")
    } finally {
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <div>
      <SectionHeading>Customer data</SectionHeading>
      {!confirming ? (
        <Button
          size="sm"
          variant="outline"
          className="text-red-600 border-red-300 hover:bg-red-50"
          onClick={() => setConfirming(true)}
        >
          Delete customer data
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-red-600">
            This will permanently delete all quotes, photos, appointments, and activity
            for <strong>{quote.email}</strong>. This cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setConfirming(false); setError(null) }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Confirm delete"}
            </Button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Contractor notes
// ---------------------------------------------------------------------------

function NotesPanel({ quote, onSave }: { quote: Quote; onSave: (notes: string) => void }) {
  const [notes, setNotes] = useState(quote.contractorNotes)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    onSave(notes)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <SectionHeading>Contractor notes</SectionHeading>
      <textarea
        rows={5}
        value={notes}
        onChange={(e) => { setNotes(e.target.value); setSaved(false) }}
        placeholder="Add notes about this quote, measurements, follow-up actions…"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button size="sm" onClick={handleSave}>Save notes</Button>
        {saved && <span className="text-xs text-muted-foreground">Saved</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fallback view for quotes that don't have localStorage data
// ---------------------------------------------------------------------------

function BasicQuoteView({ id }: { id: string }) {
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    fetchQuotes().then((quotes) => {
      const q = quotes.find((q) => q.id === id)
      if (q) setName(q.customerName)
    })
  }, [id])

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link to="/admin/quotes" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to quotes
      </Link>
      <div className="rounded-lg border p-8 text-center space-y-2">
        {name && <p className="text-base font-medium">{name}</p>}
        <p className="text-sm text-muted-foreground">
          Full detail is only available for quotes submitted through this portal.
        </p>
        <p className="text-xs text-muted-foreground">
          Quote ID: <code className="rounded bg-muted px-1 py-0.5">{id}</code>
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>("contact")
  const [editing, setEditing] = useState(false)
  const valuesRef = useRef<(() => Record<string, unknown>) | null>(null)
  const pendingEditsRef = useRef<Record<string, unknown>>({})
  const [useLocalFallback, setUseLocalFallback] = useState(false)

  // Wire up Clerk auth
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      setAuthProvider(() => getToken())
    }
  }, [isLoaded, isSignedIn, getToken])

  // Load quote from API, fall back to localStorage
  useEffect(() => {
    if (!id) { setNotFound(true); return }
    if (!isLoaded || !isSignedIn) return

    let cancelled = false
    async function load() {
      const res = await apiGet<Record<string, unknown>>(`/quotes/${encodeURIComponent(id!)}`)
      if (cancelled) return

      if (res.ok) {
        // Also fetch activity for statusHistory
        const actRes = await apiGet<{ activities: Array<Record<string, unknown>> }>(
          `/quotes/${encodeURIComponent(id!)}/activity?limit=100`
        )
        const apiQuote = res.data
        if (actRes.ok) {
          // Build statusHistory from activity feed
          const statusEvents = actRes.data.activities
            .filter((a) => a.type === "status_change")
            .map((a) => ({
              status: (a.newValue as string) as QuoteStatus,
              timestamp: a.createdAt as string,
            }))
          apiQuote.statusHistory = statusEvents

          // Extract contractor notes from most recent "note" activity
          const notes = actRes.data.activities
            .filter((a) => a.type === "note")
            .map((a) => a.content as string)
          apiQuote.contractorNotes = notes.join("\n")
        }
        if (!cancelled) setQuote(mapApiQuote(apiQuote))
      } else if (isNetworkError(res)) {
        // Fallback to localStorage
        console.warn("API unreachable — falling back to localStorage for quote detail")
        setUseLocalFallback(true)
        const q = getQuote(id!)
        if (!q) { setNotFound(true); return }
        if (!cancelled) setQuote(q)
      } else {
        // Try localStorage as last resort
        const q = getQuote(id!)
        if (!q) { setNotFound(true); return }
        if (!cancelled) {
          setUseLocalFallback(true)
          setQuote(q)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [id, isLoaded, isSignedIn])

  /** Flush current tab's form values into the pending edits accumulator. */
  const flushCurrentTab = useCallback(() => {
    if (valuesRef.current) {
      const values = valuesRef.current()
      Object.assign(pendingEditsRef.current, values)
    }
  }, [])

  /** Switch tabs, auto-saving current tab's edits when in edit mode. */
  const handleTabChange = useCallback(
    (tab: TabId) => {
      if (editing) flushCurrentTab()
      setActiveTab(tab)
    },
    [editing, flushCurrentTab]
  )

  const handleEdit = () => {
    pendingEditsRef.current = {}
    setEditing(true)
  }

  const handleSave = async () => {
    if (!id || !quote) return
    flushCurrentTab()
    const edits = pendingEditsRef.current

    if (useLocalFallback) {
      updateQuote(id, edits)
      setQuote(getQuote(id))
    } else {
      const res = await apiPatch(`/quotes/${encodeURIComponent(id)}`, edits)
      if (res.ok) {
        // Re-fetch to get updated data
        const refreshed = await apiGet<Record<string, unknown>>(`/quotes/${encodeURIComponent(id)}`)
        if (refreshed.ok) setQuote(mapApiQuote(refreshed.data))
      } else {
        // Fallback to localStorage
        updateQuote(id, edits)
        setQuote(getQuote(id))
      }
    }
    pendingEditsRef.current = {}
    setEditing(false)
  }

  const handleCancel = async () => {
    pendingEditsRef.current = {}
    setEditing(false)
    // Re-read quote to discard visual changes
    if (!id) return
    if (useLocalFallback) {
      setQuote(getQuote(id))
    } else {
      const res = await apiGet<Record<string, unknown>>(`/quotes/${encodeURIComponent(id)}`)
      if (res.ok) setQuote(mapApiQuote(res.data))
      else setQuote(getQuote(id))
    }
  }

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (notFound && id) {
    return <BasicQuoteView id={id} />
  }

  if (notFound || !quote) {
    return (
      <div className="max-w-5xl mx-auto">
        <Link to="/admin/quotes" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to quotes
        </Link>
        <p className="mt-8 text-center text-muted-foreground">Quote not found.</p>
      </div>
    )
  }

  const handleStatusChange = async (status: QuoteStatus) => {
    if (!id) return

    if (useLocalFallback) {
      updateStatus(id, status)
      setQuote(getQuote(id))
    } else {
      const res = await apiPost(`/quotes/${encodeURIComponent(id)}/activity`, {
        type: "status_change",
        newStatus: status,
      })
      if (res.ok) {
        // Re-fetch the quote to get updated status + activity
        const refreshed = await apiGet<Record<string, unknown>>(`/quotes/${encodeURIComponent(id)}`)
        if (refreshed.ok) {
          const actRes = await apiGet<{ activities: Array<Record<string, unknown>> }>(
            `/quotes/${encodeURIComponent(id)}/activity?limit=100`
          )
          const apiQuote = refreshed.data
          if (actRes.ok) {
            apiQuote.statusHistory = actRes.data.activities
              .filter((a) => a.type === "status_change")
              .map((a) => ({ status: a.newValue as QuoteStatus, timestamp: a.createdAt as string }))
            apiQuote.contractorNotes = actRes.data.activities
              .filter((a) => a.type === "note")
              .map((a) => a.content as string)
              .join("\n")
          }
          setQuote(mapApiQuote(apiQuote))
        }
      } else {
        updateStatus(id, status)
        setQuote(getQuote(id))
      }
    }
  }

  const handleNotesSave = async (notes: string) => {
    if (!id) return

    if (useLocalFallback) {
      updateNotes(id, notes)
    } else {
      await apiPost(`/quotes/${encodeURIComponent(id)}/activity`, {
        type: "note",
        content: notes,
      })
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <Link to="/admin/quotes" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to quotes
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{quote.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">{quote.jobSiteAddress}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Submitted {formatDateTime(quote.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={quote.status} />
          {!editing && (
            <Button size="sm" variant="outline" onClick={handleEdit}>
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Edit mode toolbar */}
      {editing && (
        <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-2">
          <span className="text-sm font-medium text-primary">Editing</span>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save changes
          </Button>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        {/* Left — tabbed intake pages */}
        <div>
          {/* Tab bar */}
          <div className="flex border-b mb-6">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  activeTab === tab.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <QuoteProvider quote={quote} readOnly={!editing} valuesRef={valuesRef}>
            {activeTab === "contact" && <IntakePage />}
            {activeTab === "scope" && <IntakeScreen2Page />}
            {activeTab === "photos" && <IntakePhotosPage />}
          </QuoteProvider>
        </div>

        {/* Right — admin actions */}
        <div className="space-y-8">
          <StatusPanel quote={quote} onStatusChange={handleStatusChange} />
          <StatusTimeline quote={quote} />
          <NotesPanel quote={quote} onSave={handleNotesSave} />
          <DeleteCustomerDataPanel
            quote={quote}
            onDeleted={() => {
              // Navigate back to quotes list after successful deletion
              window.location.href = "/admin/quotes"
            }}
          />
        </div>
      </div>
    </div>
  )
}
