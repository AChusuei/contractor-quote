import { useState } from "react"
import { Button } from "components"
import { STATUS_LABELS, type QuoteStatus } from "@/lib/statusTransitions"

export type ActivityItem = {
  id: string
  type: string
  content?: string
  newValue?: string
  createdAt: string
  actorName?: string | null
  actorEmail?: string | null
}

const ACTIVITY_ICONS: Record<string, string> = {
  status_change: "\u2192", // →
  note: "\u270e", // ✎
  photo_added: "\ud83d\udcf7", // 📷
  photo_removed: "\u2716", // ✖
  quote_edited: "\u270f\ufe0f", // ✏️
  estimate_sent: "\ud83d\udce8", // 📨
  email_sent: "\u2709\ufe0f", // ✉️
}

const ACTIVITY_LABELS: Record<string, string> = {
  status_change: "Status changed",
  note: "Note",
  photo_added: "Photo added",
  photo_removed: "Photo removed",
  quote_edited: "Quote edited",
  estimate_sent: "Estimate sent",
  email_sent: "Email sent",
}

function formatDateTime(iso: string): string {
  // SQLite datetime('now') returns "YYYY-MM-DD HH:MM:SS" without timezone info.
  // Normalize to UTC ISO format so the browser converts to the user's local time.
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

const FIELD_LABELS: Record<string, string> = {
  jobSiteAddress: "Job site address",
  propertyType: "Property type",
  budgetRange: "Budget range",
  name: "Customer name",
  email: "Email",
  phone: "Phone",
  cell: "Cell",
  howDidYouFindUs: "How they found us",
  referredByContractor: "Referred by contractor",
  "scope.scopeType": "Scope type",
  "scope.layoutChanges": "Layout changes",
  "scope.kitchenSize": "Kitchen size",
  "scope.cabinets": "Cabinets",
  "scope.cabinetDoorStyle": "Cabinet door style",
  "scope.countertopMaterial": "Countertop material",
  "scope.countertopEdge": "Countertop edge",
  "scope.sinkType": "Sink type",
  "scope.backsplash": "Backsplash",
  "scope.flooringAction": "Flooring",
  "scope.flooringType": "Flooring type",
  "scope.applianceFridge": "Fridge",
  "scope.applianceRange": "Range",
  "scope.applianceDishwasher": "Dishwasher",
  "scope.applianceHood": "Hood",
  "scope.applianceMicrowave": "Microwave",
  "scope.islandPeninsula": "Island/peninsula",
  "scope.designHelp": "Design help",
  "scope.additionalNotes": "Additional notes",
}

const VALUE_LABELS: Record<string, string> = {
  // propertyType
  house: "House", apt: "Apartment", building: "Building", townhouse: "Townhouse",
  // budgetRange
  "<10k": "Under $10k", "10-25k": "$10k–$25k", "25-50k": "$25k–$50k", "50k+": "$50k+",
  // scopeType
  supply_only: "Supply only", supply_install: "Supply & install",
  // kitchenSize
  small: "Small", medium: "Medium", large: "Large", open_concept: "Open concept",
  // cabinets
  new: "New", reface: "Reface", keep: "Keep",
  // flooring
  replace: "Replace",
  // backsplash / yes-no
  yes: "Yes", no: "No", undecided: "Undecided",
  // appliances
  existing: "Existing", none: "None",
  // islandPeninsula
  island: "Island", peninsula: "Peninsula", both: "Both",
}

const MAX_TEXT_PREVIEW = 80

type ChangeRecord = { field: string; from: unknown; to: unknown }

function truncate(s: string): string {
  return s.length > MAX_TEXT_PREVIEW ? s.slice(0, MAX_TEXT_PREVIEW) + "…" : s
}

function labelText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—"
  const s = String(v)
  const labeled = VALUE_LABELS[s]
  if (labeled) return labeled
  return `"${truncate(s)}"`
}

function formatEditedFields(content: string): string {
  try {
    const parsed: unknown = JSON.parse(content)
    if (!Array.isArray(parsed) || parsed.length === 0) return content

    // New format: [{field, from, to}]
    if (typeof parsed[0] === "object" && parsed[0] !== null && "field" in parsed[0]) {
      return (parsed as ChangeRecord[]).map(({ field, from, to }) => {
        const label = FIELD_LABELS[field] ?? field
        return `${label}: ${labelText(from)} → ${labelText(to)}`
      }).join("\n")
    }

    // Legacy format: ["field1", "field2"]
    if (typeof parsed[0] === "string") {
      const labels = (parsed as string[]).map((k) => FIELD_LABELS[k] ?? k)
      return "Updated: " + labels.join(", ")
    }

    return content
  } catch {
    return content
  }
}

function ActivityEntry({ item }: { item: ActivityItem }) {
  const icon = ACTIVITY_ICONS[item.type] ?? "\u2022"
  const label = ACTIVITY_LABELS[item.type] ?? item.type

  let detail: string | null = null
  if (item.type === "status_change" && item.newValue) {
    detail = STATUS_LABELS[item.newValue as QuoteStatus] ?? item.newValue
  } else if (item.type === "quote_edited" && item.content) {
    detail = formatEditedFields(item.content)
  } else if (item.content) {
    detail = item.content
  }

  const actor = item.actorName ?? item.actorEmail ?? null

  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-b-0">
      <span className="mt-0.5 text-base w-6 text-center shrink-0" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium">{label}</span>
          {actor && (
            <span className="text-xs text-muted-foreground">by {actor}</span>
          )}
          <span className="text-xs text-muted-foreground">
            {formatDateTime(item.createdAt)}
          </span>
        </div>
        {detail && (
          <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
            {detail}
          </p>
        )}
      </div>
    </div>
  )
}

export function ActivityFeed({
  activities,
  onAddComment,
}: {
  activities: ActivityItem[]
  onAddComment: (content: string) => Promise<void>
}) {
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    const text = comment.trim()
    if (!text) return
    setSubmitting(true)
    try {
      await onAddComment(text)
      setComment("")
    } finally {
      setSubmitting(false)
    }
  }

  // Show oldest first (chronological)
  const sorted = [...activities].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  return (
    <div className="space-y-4">
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No activity yet.
        </p>
      ) : (
        <div>
          {sorted.map((item) => (
            <ActivityEntry key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Add comment input */}
      <div className="space-y-2 pt-2 border-t">
        <textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          disabled={submitting}
        />
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={submitting || !comment.trim()}
        >
          {submitting ? "Adding..." : "Add comment"}
        </Button>
      </div>
    </div>
  )
}
