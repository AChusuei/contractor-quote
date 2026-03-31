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
} from "@/lib/quoteStore"
import { fetchQuotes } from "@/lib/quotes"
import { cn } from "@/lib/utils"
import { QuoteProvider } from "@/lib/QuoteContext"
import { IntakePage } from "@/pages/IntakePage"
import { IntakeScreen2Page } from "@/pages/IntakeScreen2Page"
import { IntakePhotosPage } from "@/pages/IntakePhotosPage"
import { apiGet, apiPatch, apiPost, isNetworkError, setAuthProvider } from "@/lib/api"
import {
  STATUS_LABELS,
  STATUS_COLORS,
  CONFIRMATION_STATUSES,
  getHappyPathTransitions,
  getSecondaryTransitions,
  type QuoteStatus,
} from "@/lib/statusTransitions"
import { useAutoSave } from "@/hooks/useAutoSave"
import { ActivityFeed, type ActivityItem } from "@/components/ActivityFeed"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  const colorClass = STATUS_COLORS[status] ?? STATUS_COLORS.draft
  const label = STATUS_LABELS[status] ?? status
  return <span className={colorClass}>{label}</span>
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
// Tabs — now includes Activity
// ---------------------------------------------------------------------------

type TabId = "contact" | "scope" | "photos" | "activity"

const TABS: { id: TabId; label: string }[] = [
  { id: "contact", label: "Contact & Project" },
  { id: "scope", label: "Project Scope" },
  { id: "photos", label: "Photos" },
  { id: "activity", label: "Activity" },
]

// ---------------------------------------------------------------------------
// Status panel — shows only valid next transitions
// ---------------------------------------------------------------------------

function StatusPanel({
  quote,
  onStatusChange,
}: {
  quote: Quote
  onStatusChange: (status: QuoteStatus) => void
}) {
  const [confirmingStatus, setConfirmingStatus] = useState<QuoteStatus | null>(null)

  const happyPath = getHappyPathTransitions(quote.status as QuoteStatus)
  const secondary = getSecondaryTransitions(quote.status as QuoteStatus)

  const handleClick = (status: QuoteStatus) => {
    if (CONFIRMATION_STATUSES.has(status)) {
      setConfirmingStatus(status)
    } else {
      onStatusChange(status)
    }
  }

  const handleConfirm = () => {
    if (confirmingStatus) {
      onStatusChange(confirmingStatus)
      setConfirmingStatus(null)
    }
  }

  return (
    <div>
      <SectionHeading>Status</SectionHeading>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Current:</span>
        <StatusBadge status={quote.status as QuoteStatus} />
      </div>

      {(happyPath.length > 0 || secondary.length > 0) && (
        <>
          <p className="text-xs text-muted-foreground mb-2">Next steps</p>
          <div className="flex flex-wrap gap-2">
            {happyPath.map((s) => (
              <button
                key={s}
                onClick={() => handleClick(s)}
                className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                &rarr; {STATUS_LABELS[s]}
              </button>
            ))}
            {secondary.map((s) => (
              <button
                key={s}
                onClick={() => handleClick(s)}
                className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Confirmation dialog */}
      {confirmingStatus && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
          <p className="text-sm text-amber-900">
            Move this quote to <strong>{STATUS_LABELS[confirmingStatus]}</strong>?
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmingStatus(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleConfirm}
            >
              Confirm
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

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
              {deleting ? "Deleting\u2026" : "Confirm delete"}
            </Button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
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
// Save status indicator
// ---------------------------------------------------------------------------

function SaveIndicator({ status }: { status: string }) {
  if (status === "idle") return null
  const text =
    status === "saving"
      ? "Saving\u2026"
      : status === "saved"
        ? "Saved"
        : "Save error"
  const color =
    status === "error"
      ? "text-red-600"
      : "text-muted-foreground"
  return <span className={cn("text-xs", color)}>{text}</span>
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
  const valuesRef = useRef<(() => Record<string, unknown>) | null>(null)
  const pendingEditsRef = useRef<Record<string, unknown>>({})
  const [useLocalFallback, setUseLocalFallback] = useState(false)
  const [activities, setActivities] = useState<ActivityItem[]>([])

  // Wire up Clerk auth
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      setAuthProvider(() => getToken())
    }
  }, [isLoaded, isSignedIn, getToken])

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadQuote = useCallback(async () => {
    if (!id || !isLoaded || !isSignedIn) return

    const res = await apiGet<Record<string, unknown>>(`/quotes/${encodeURIComponent(id)}`)

    if (res.ok) {
      const actRes = await apiGet<{ activities: Array<Record<string, unknown>> }>(
        `/quotes/${encodeURIComponent(id)}/activity?limit=100`
      )
      const apiQuote = res.data
      if (actRes.ok) {
        const activityItems = actRes.data.activities as ActivityItem[]
        setActivities(activityItems)

        apiQuote.statusHistory = actRes.data.activities
          .filter((a) => a.type === "status_change")
          .map((a) => ({
            status: (a.newValue as string) as QuoteStatus,
            timestamp: a.createdAt as string,
          }))
        apiQuote.contractorNotes = actRes.data.activities
          .filter((a) => a.type === "note")
          .map((a) => a.content as string)
          .join("\n")
      }
      setQuote(mapApiQuote(apiQuote))
    } else if (isNetworkError(res)) {
      console.warn("API unreachable — falling back to localStorage for quote detail")
      setUseLocalFallback(true)
      const q = getQuote(id)
      if (!q) { setNotFound(true); return }
      setQuote(q)
    } else {
      const q = getQuote(id)
      if (!q) { setNotFound(true); return }
      setUseLocalFallback(true)
      setQuote(q)
    }
  }, [id, isLoaded, isSignedIn])

  useEffect(() => {
    loadQuote()
  }, [loadQuote])

  // ---------------------------------------------------------------------------
  // Auto-save
  // ---------------------------------------------------------------------------

  /** Flush current tab's form values into the pending edits accumulator. */
  const flushCurrentTab = useCallback(() => {
    if (valuesRef.current) {
      const values = valuesRef.current()
      Object.assign(pendingEditsRef.current, values)
    }
  }, [])

  const performSave = useCallback(async () => {
    if (!id || !quote) return
    flushCurrentTab()
    const edits = { ...pendingEditsRef.current }
    if (Object.keys(edits).length === 0) return

    if (useLocalFallback) {
      updateQuote(id, edits)
      setQuote(getQuote(id))
    } else {
      const res = await apiPatch(`/quotes/${encodeURIComponent(id)}`, edits)
      if (res.ok) {
        const refreshed = await apiGet<Record<string, unknown>>(`/quotes/${encodeURIComponent(id)}`)
        if (refreshed.ok) setQuote(mapApiQuote(refreshed.data))
      } else {
        updateQuote(id, edits)
        setQuote(getQuote(id))
      }
    }
    pendingEditsRef.current = {}
  }, [id, quote, useLocalFallback, flushCurrentTab])

  const { trigger: triggerAutoSave, flush: flushAutoSave, status: saveStatus } = useAutoSave(performSave)

  /** Called by child forms on every field change via QuoteContext. */
  const onFieldChange = useCallback(() => {
    triggerAutoSave()
  }, [triggerAutoSave])

  /** Switch tabs — flush immediately before switching. */
  const handleTabChange = useCallback(
    async (tab: TabId) => {
      flushCurrentTab()
      if (Object.keys(pendingEditsRef.current).length > 0) {
        await flushAutoSave()
      }
      setActiveTab(tab)
    },
    [flushCurrentTab, flushAutoSave]
  )

  // ---------------------------------------------------------------------------
  // Status changes
  // ---------------------------------------------------------------------------

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
        await loadQuote()
      } else {
        updateStatus(id, status)
        setQuote(getQuote(id))
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Activity: add comment
  // ---------------------------------------------------------------------------

  const handleAddComment = async (content: string) => {
    if (!id) return

    if (useLocalFallback) {
      updateNotes(id, content)
    } else {
      const res = await apiPost(`/quotes/${encodeURIComponent(id)}/activity`, {
        type: "note",
        content,
      })
      if (res.ok) {
        // Optimistic append
        const newItem: ActivityItem = {
          id: `temp-${Date.now()}`,
          type: "note",
          content,
          createdAt: new Date().toISOString(),
        }
        setActivities((prev) => [...prev, newItem])
        // Also reload in background to get real ID
        loadQuote()
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Render guards
  // ---------------------------------------------------------------------------

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading\u2026</p>
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

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <Link to="/admin/quotes" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to quotes
      </Link>

      {/* Header — no duplicate address, no Edit button */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{quote.name}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Submitted {formatDateTime(quote.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator status={saveStatus} />
          <StatusBadge status={quote.status as QuoteStatus} />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        {/* Left — tabbed content */}
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
          {activeTab === "activity" ? (
            <ActivityFeed
              activities={activities}
              onAddComment={handleAddComment}
            />
          ) : (
            <QuoteProvider
              quote={quote}
              readOnly={false}
              valuesRef={valuesRef}
              onFieldChange={onFieldChange}
            >
              {activeTab === "contact" && <IntakePage />}
              {activeTab === "scope" && <IntakeScreen2Page />}
              {activeTab === "photos" && <IntakePhotosPage />}
            </QuoteProvider>
          )}
        </div>

        {/* Right — sidebar: StatusPanel + DeleteCustomerDataPanel only */}
        <div className="space-y-8">
          <StatusPanel quote={quote} onStatusChange={handleStatusChange} />
          <DeleteCustomerDataPanel
            quote={quote}
            onDeleted={() => {
              window.location.href = "/admin/quotes"
            }}
          />
        </div>
      </div>
    </div>
  )
}
