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
import { getQuotePhotos } from "@/lib/supabase"
import { fetchQuotes } from "@/lib/quotes"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Status config (extends the existing statuses from quoteStore)
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

const PROPERTY_LABELS: Record<string, string> = {
  house: "House",
  apt: "Apartment",
  building: "Building",
  townhouse: "Townhouse",
}

const KITCHEN_SIZE_LABELS: Record<string, string> = {
  small: "Small (< 70 sq ft)",
  medium: "Medium (70–150 sq ft)",
  large: "Large (150+ sq ft)",
  open_concept: "Open concept",
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm mt-0.5">{value}</p>
    </div>
  )
}

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
            → {STATUS_LABELS[s]}
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
// Photos section
// ---------------------------------------------------------------------------

function PhotosSection({ photoSessionId }: { photoSessionId?: string }) {
  const [photos, setPhotos] = useState<{ key: string; url: string }[]>([])

  useEffect(() => {
    if (!photoSessionId) return
    let revoke: (() => void) | undefined
    getQuotePhotos(photoSessionId).then((results) => {
      const items = results.map(({ key, file }) => ({
        key,
        url: URL.createObjectURL(file),
      }))
      setPhotos(items)
      revoke = () => items.forEach(({ url }) => URL.revokeObjectURL(url))
    })
    return () => revoke?.()
  }, [photoSessionId])

  return (
    <div>
      <SectionHeading>Photos</SectionHeading>
      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photos uploaded.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map(({ key, url }) => (
            <a key={key} href={url} target="_blank" rel="noopener noreferrer">
              <img
                src={url}
                alt="Quote photo"
                className="rounded-md border aspect-square object-cover w-full hover:opacity-90 transition-opacity"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fallback view for quotes that don't have localStorage data (e.g. mock/API quotes)
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
    <div className="max-w-3xl mx-auto space-y-6">
      <Link to="/admin/quotes" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to quotes
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
      <div className="max-w-3xl mx-auto">
        <Link to="/admin/quotes" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to quotes
        </Link>
        <p className="mt-8 text-center text-muted-foreground">Quote not found.</p>
      </div>
    )
  }

  const scope = quote.scope

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
    <div className="max-w-3xl mx-auto space-y-8">
      <Link to="/admin/quotes" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to quotes
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

      <div className="grid gap-8 sm:grid-cols-2">
        {/* Left — quote data */}
        <div className="space-y-8">
          {/* Contact info */}
          <div>
            <SectionHeading>Contact information</SectionHeading>
            <div className="space-y-3">
              <DetailRow label="Name" value={quote.name} />
              <DetailRow label="Email" value={quote.email} />
              <DetailRow label="Phone" value={quote.phone} />
              {quote.cell && <DetailRow label="Cell" value={quote.cell} />}
              <DetailRow label="How they found us" value={quote.howDidYouFindUs} />
              {quote.referredByContractor && (
                <DetailRow label="Referred by" value={quote.referredByContractor} />
              )}
            </div>
          </div>

          {/* Project overview */}
          <div>
            <SectionHeading>Project overview</SectionHeading>
            <div className="space-y-3">
              <DetailRow label="Address" value={quote.jobSiteAddress} />
              <DetailRow label="Property type" value={PROPERTY_LABELS[quote.propertyType]} />
              <DetailRow label="Budget range" value={quote.budgetRange} />
              {quote.quotePath && (
                <DetailRow
                  label="Quote path"
                  value={quote.quotePath === "site_visit" ? "Site visit" : "Rough estimate"}
                />
              )}
            </div>
          </div>

          {/* Project scope */}
          {scope && (
            <div>
              <SectionHeading>Project scope</SectionHeading>
              <div className="space-y-3">
                <DetailRow
                  label="Scope type"
                  value={scope.scopeType === "supply_only" ? "Supply only" : "Supply + install"}
                />
                <DetailRow
                  label="Layout changes"
                  value={scope.layoutChanges === "yes" ? "Yes" : "No"}
                />
                <DetailRow label="Kitchen size" value={KITCHEN_SIZE_LABELS[scope.kitchenSize]} />
                <DetailRow
                  label="Cabinets"
                  value={
                    scope.cabinets === "new"
                      ? "New cabinets"
                      : scope.cabinets === "reface"
                      ? "Reface existing"
                      : "Keep as-is"
                  }
                />
                <DetailRow label="Cabinet door style" value={scope.cabinetDoorStyle} />
                <DetailRow label="Countertop material" value={scope.countertopMaterial} />
                <DetailRow label="Edge profile" value={scope.countertopEdge} />
                <DetailRow label="Sink type" value={scope.sinkType} />
                <DetailRow
                  label="Backsplash"
                  value={
                    scope.backsplash === "yes"
                      ? "Yes"
                      : scope.backsplash === "no"
                      ? "No"
                      : "Undecided"
                  }
                />
                <DetailRow
                  label="Flooring"
                  value={
                    scope.flooringAction === "keep"
                      ? "Keep existing"
                      : `Replace — ${scope.flooringType ?? "type TBD"}`
                  }
                />
                <DetailRow
                  label="Island / peninsula"
                  value={scope.islandPeninsula === "none" ? "None" : scope.islandPeninsula}
                />
                <DetailRow
                  label="Design help"
                  value={
                    scope.designHelp === "yes"
                      ? "Yes, needs design direction"
                      : "No, has a clear vision"
                  }
                />
              </div>

              {/* Appliances */}
              <div className="mt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  Appliances
                </p>
                <div className="rounded-md border divide-y text-sm">
                  {[
                    { label: "Refrigerator", value: scope.applianceFridge },
                    { label: "Range / Stove", value: scope.applianceRange },
                    { label: "Dishwasher", value: scope.applianceDishwasher },
                    { label: "Range Hood", value: scope.applianceHood },
                    { label: "Microwave", value: scope.applianceMicrowave },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between px-3 py-2">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={cn("capitalize font-medium", value === "none" && "text-muted-foreground font-normal")}>
                        {value === "none" ? "Not included" : value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {scope.additionalNotes && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    Additional notes
                  </p>
                  <p className="text-sm bg-muted/40 rounded-md p-3">{scope.additionalNotes}</p>
                </div>
              )}
            </div>
          )}

          {/* Photos */}
          <PhotosSection photoSessionId={quote.photoSessionId} />
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
