import { useState, useEffect, useRef, useCallback } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { useAuth } from "@clerk/clerk-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
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
import { ProjectScopeForm, projectScopeSchema, type ProjectScopeData } from "@/components/forms/ProjectScopeForm"
import { PhotosForm } from "@/components/forms/PhotosForm"
import { apiGet, apiPatch, apiPost, apiDelete, isNetworkError, setAuthProvider } from "@/lib/api"
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
import { MailIcon } from "lucide-react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extended quote with customerId from API */
type QuoteWithCustomer = Quote & { customerId?: string }

/** Map API quote response to the frontend Quote type */
function mapApiQuote(raw: Record<string, unknown>): QuoteWithCustomer {
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
    customerId: (raw.customerId as string) ?? undefined,
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
  const normalized = /Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso.replace(" ", "T") + "Z"
  return new Date(normalized).toLocaleString(undefined, {
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

type TabId = "scope" | "photos" | "activity"

const TABS: { id: TabId; label: string }[] = [
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
// Admin form tab wrappers — set up useForm and wire auto-save
// ---------------------------------------------------------------------------

function ScopeTab({
  quote,
  valuesRef,
  onFieldChange,
}: {
  quote: Quote
  valuesRef: React.MutableRefObject<(() => Record<string, unknown>) | null>
  onFieldChange: () => void
}) {
  const scope = quote.scope

  const {
    register,
    control,
    watch,
    getValues,
    formState: { errors },
  } = useForm<ProjectScopeData>({
    resolver: zodResolver(projectScopeSchema),
    mode: "onTouched",
    defaultValues: {
      jobSiteAddress: quote.jobSiteAddress ?? "",
      propertyType: quote.propertyType,
      budgetRange: quote.budgetRange,
      scopeType: scope?.scopeType,
      layoutChanges: scope?.layoutChanges,
      kitchenSize: scope?.kitchenSize,
      cabinets: scope?.cabinets,
      cabinetDoorStyle: scope?.cabinetDoorStyle ?? "",
      countertopMaterial: scope?.countertopMaterial ?? "",
      countertopEdge: scope?.countertopEdge ?? "",
      sinkType: scope?.sinkType ?? "",
      backsplash: scope?.backsplash,
      flooringAction: scope?.flooringAction,
      flooringType: scope?.flooringType ?? "",
      applianceFridge: scope?.applianceFridge ?? "none",
      applianceRange: scope?.applianceRange ?? "none",
      applianceDishwasher: scope?.applianceDishwasher ?? "none",
      applianceHood: scope?.applianceHood ?? "none",
      applianceMicrowave: scope?.applianceMicrowave ?? "none",
      islandPeninsula: scope?.islandPeninsula,
      designHelp: scope?.designHelp,
      additionalNotes: scope?.additionalNotes ?? "",
    },
  })

  useEffect(() => {
    valuesRef.current = () => {
      const { jobSiteAddress, propertyType, budgetRange, ...scopeFields } = getValues()
      return { jobSiteAddress, propertyType, budgetRange, scope: scopeFields } as Record<string, unknown>
    }
    return () => { valuesRef.current = null }
  }, [valuesRef, getValues])

  useEffect(() => {
    const sub = watch(() => onFieldChange())
    return () => sub.unsubscribe()
  }, [onFieldChange, watch])

  return (
    <ProjectScopeForm
      register={register}
      control={control}
      errors={errors}
      watch={watch}
      readOnly={false}
    />
  )
}

// ---------------------------------------------------------------------------
// Delete quote panel
// ---------------------------------------------------------------------------

function DeleteQuotePanel({
  quoteId,
  onDeleted,
}: {
  quoteId: string
  onDeleted: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      const res = await apiDelete(`/quotes/${encodeURIComponent(quoteId)}`, {
        requestType: "contractor",
      })
      if (res.ok) {
        onDeleted()
      } else {
        throw new Error("error" in res ? res.error : "Delete failed")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred")
    } finally {
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground border-b pb-2 mb-4">
        Delete quote
      </h3>
      {!confirming ? (
        <Button
          size="sm"
          variant="outline"
          className="text-red-600 border-red-300 hover:bg-red-50"
          onClick={() => setConfirming(true)}
        >
          Delete quote
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-red-600">
            Are you sure? This will permanently delete this quote, its photos, and activity history.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setConfirming(false)
                setError(null)
              }}
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
// Main page
// ---------------------------------------------------------------------------

export function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const [quote, setQuote] = useState<QuoteWithCustomer | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>("scope")
  const valuesRef = useRef<(() => Record<string, unknown>) | null>(null)
  const pendingEditsRef = useRef<Record<string, unknown>>({})
  const isDirtyRef = useRef(false)
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
    const flushed = { ...pendingEditsRef.current }
    // Only send fields that actually differ from the stored quote
    const edits: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(flushed)) {
      const stored = quote[key as keyof typeof quote]
      if (JSON.stringify(value) !== JSON.stringify(stored)) {
        edits[key] = value
      }
    }
    if (Object.keys(edits).length === 0) {
      pendingEditsRef.current = {}
      isDirtyRef.current = false
      return
    }

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
    isDirtyRef.current = false
  }, [id, quote, useLocalFallback, flushCurrentTab])

  const { trigger: triggerAutoSave, flush: flushAutoSave } = useAutoSave(performSave)

  /** Called by child forms on every field change via tab wrappers. */
  const onFieldChange = useCallback(() => {
    isDirtyRef.current = true
    triggerAutoSave()
  }, [triggerAutoSave])

  /** Switch tabs — flush immediately before switching, but only if something changed. */
  const handleTabChange = useCallback(
    async (tab: TabId) => {
      if (isDirtyRef.current) {
        flushCurrentTab()
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

      {/* Customer name link + email */}
      {quote.name && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Customer:</span>
          {quote.customerId ? (
            <Link
              to={`/admin/customers/${quote.customerId}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              {quote.name}
            </Link>
          ) : (
            <span className="text-sm font-medium">{quote.name}</span>
          )}
          {quote.email && (
            <a
              href={`mailto:${quote.email}?subject=${encodeURIComponent(`Re: Quote for ${quote.jobSiteAddress || "your project"}`)}`}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title={`Email ${quote.email}`}
            >
              <MailIcon className="h-4 w-4" />
            </a>
          )}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        {/* Left — tabbed content */}
        <div>
          {/* Tab bar */}
          <div className="flex items-center border-b mb-6">
            <div className="flex flex-1">
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
            <div className="flex items-center gap-3 ml-auto pb-1">
              <span className="text-xs text-muted-foreground">
                Submitted {formatDateTime(quote.createdAt)}
              </span>
            </div>
          </div>

          {/* Tab content — form components rendered directly, no chrome */}
          {activeTab === "activity" && (
            <ActivityFeed
              activities={activities}
              onAddComment={handleAddComment}
            />
          )}
          {activeTab === "scope" && (
            <ScopeTab
              quote={quote}
              valuesRef={valuesRef}
              onFieldChange={onFieldChange}
            />
          )}
          {activeTab === "photos" && (
            <PhotosForm
              quoteId={quote.id}
              readOnly={false}
            />
          )}
        </div>

        {/* Right — sidebar */}
        <div className="space-y-8">
          <StatusPanel quote={quote} onStatusChange={handleStatusChange} />
          <DeleteQuotePanel
            quoteId={quote.id}
            onDeleted={() => navigate("/admin/quotes")}
          />
        </div>
      </div>
    </div>
  )
}
