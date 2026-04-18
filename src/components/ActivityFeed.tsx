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
  scope: "Project scope",
  name: "Customer name",
  email: "Email",
  phone: "Phone",
  cell: "Cell",
  howDidYouFindUs: "How they found us",
  referredByContractor: "Referred by contractor",
}

function formatEditedFields(content: string): string {
  try {
    const keys = JSON.parse(content) as string[]
    const labels = keys.map((k) => FIELD_LABELS[k] ?? k)
    return "Updated: " + labels.join(", ")
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
