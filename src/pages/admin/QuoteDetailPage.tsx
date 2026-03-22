import { useState, useEffect } from "react"
import { useParams, Link } from "react-router-dom"
import { useAuth } from "@clerk/clerk-react"
import { Button } from "components"
import {
  getQuote,
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
  const { isLoaded, isSignedIn } = useAuth()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>("contact")

  useEffect(() => {
    if (!id) { setNotFound(true); return }
    const q = getQuote(id)
    if (!q) { setNotFound(true); return }
    setQuote(q)
  }, [id])

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

  const handleStatusChange = (status: QuoteStatus) => {
    if (!id) return
    updateStatus(id, status)
    setQuote(getQuote(id))
  }

  const handleNotesSave = (notes: string) => {
    if (!id) return
    updateNotes(id, notes)
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
        <StatusBadge status={quote.status} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        {/* Left — tabbed intake pages */}
        <div>
          {/* Tab bar */}
          <div className="flex border-b mb-6">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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

          {/* Tab content — each tab renders an intake page in read-only mode */}
          <QuoteProvider quote={quote} readOnly>
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
        </div>
      </div>
    </div>
  )
}
