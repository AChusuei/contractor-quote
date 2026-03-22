import { useState, useMemo } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useAuth } from "@clerk/clerk-react"
import { Button } from "components"
import { listQuotes, type Quote } from "@/lib/quoteStore"
import { cn } from "@/lib/utils"
import { ChevronDown, Plus, Eye, Send, ArrowLeft } from "lucide-react"

// ---------------------------------------------------------------------------
// Merge field helpers
// ---------------------------------------------------------------------------

const MERGE_FIELDS = [
  { key: "name", label: "Name" },
  { key: "address", label: "Address" },
  { key: "budget", label: "Budget" },
  { key: "status", label: "Status" },
] as const

type MergeFieldKey = (typeof MERGE_FIELDS)[number]["key"]

const BUDGET_LABELS: Record<string, string> = {
  "<10k": "Under $10k",
  "10-25k": "$10k – $25k",
  "25-50k": "$25k – $50k",
  "50k+": "$50k+",
}

const STATUS_LABELS: Record<string, string> = {
  lead: "Lead",
  measure_scheduled: "Measure Scheduled",
  quoted: "Quoted",
  accepted: "Accepted",
  rejected: "Rejected",
}

function resolveMergeFields(template: string, quote: Quote): string {
  return template
    .replace(/\{\{name\}\}/g, quote.name)
    .replace(/\{\{address\}\}/g, quote.jobSiteAddress)
    .replace(/\{\{budget\}\}/g, BUDGET_LABELS[quote.budgetRange] ?? quote.budgetRange)
    .replace(/\{\{status\}\}/g, STATUS_LABELS[quote.status] ?? quote.status)
}

// ---------------------------------------------------------------------------
// Pre-built templates
// ---------------------------------------------------------------------------

type EmailTemplate = {
  id: string
  name: string
  subject: string
  body: string
}

const TEMPLATES: EmailTemplate[] = [
  {
    id: "follow-up",
    name: "Follow-up on Pending Quote",
    subject: "Following up on your kitchen quote request",
    body: `Hi {{name}},

Thank you for your interest in our kitchen remodeling services. We wanted to follow up on your quote request for {{address}}.

Based on your budget range of {{budget}}, we'd love to discuss the next steps with you.

Please let us know a convenient time to connect, or reply to this email with any questions.

Best regards`,
  },
  {
    id: "estimate-ready",
    name: "Estimate Ready Notification",
    subject: "Your kitchen estimate is ready",
    body: `Hi {{name}},

Great news! We've completed the estimate for your kitchen project at {{address}}.

Your current quote status is: {{status}}.

We'd love to walk you through the details and answer any questions. Please reply to schedule a review call, or we can meet at the job site.

Thank you for choosing us!`,
  },
  {
    id: "scheduling",
    name: "Scheduling Reminder",
    subject: "Reminder: Schedule your site visit",
    body: `Hi {{name}},

This is a friendly reminder that we still need to schedule a site visit for your kitchen project at {{address}}.

An on-site measurement is the best way for us to provide you with an accurate estimate within your {{budget}} budget range.

Please reply with a few dates and times that work for you, and we'll get something on the calendar.

Looking forward to hearing from you!`,
  },
  {
    id: "general",
    name: "General Announcement",
    subject: "An update from your kitchen remodeling team",
    body: `Hi {{name}},

We hope this message finds you well. We wanted to reach out with an update regarding your project at {{address}}.

Your current status: {{status}}.

If you have any questions or would like to discuss your project, please don't hesitate to reach out.

Thank you for your continued trust in our team.`,
  },
]

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function RecipientList({ quotes }: { quotes: Quote[] }) {
  const [expanded, setExpanded] = useState(false)
  const displayQuotes = expanded ? quotes : quotes.slice(0, 5)

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">
          Recipients ({quotes.length})
        </h3>
      </div>
      <ul className="space-y-2">
        {displayQuotes.map((q) => (
          <li key={q.id} className="flex items-center justify-between text-sm">
            <div>
              <span className="font-medium">{q.name}</span>
              <span className="text-muted-foreground ml-2">{q.email}</span>
            </div>
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              {q.jobSiteAddress}
            </span>
          </li>
        ))}
      </ul>
      {quotes.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-primary hover:underline"
        >
          {expanded ? "Show less" : `Show all ${quotes.length} recipients`}
        </button>
      )}
    </div>
  )
}

function TemplatePicker({
  templates,
  selectedId,
  onSelect,
}: {
  templates: EmailTemplate[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="relative">
      <label className="block text-sm font-medium mb-1.5">Template</label>
      <div className="relative">
        <select
          value={selectedId}
          onChange={(e) => onSelect(e.target.value)}
          className="w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  )
}

function MergeFieldButtons({
  onInsert,
}: {
  onInsert: (field: MergeFieldKey) => void
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-muted-foreground mr-1">Insert:</span>
      {MERGE_FIELDS.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onInsert(f.key)}
          className="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent transition-colors"
        >
          <Plus className="h-3 w-3" />
          {`{{${f.label}}}`}
        </button>
      ))}
    </div>
  )
}

function PreviewPanel({
  subject,
  body,
  quote,
}: {
  subject: string
  body: string
  quote: Quote
}) {
  const resolvedSubject = resolveMergeFields(subject, quote)
  const resolvedBody = resolveMergeFields(body, quote)

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3 flex items-center gap-2">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Preview</h3>
        <span className="text-xs text-muted-foreground">
          (showing: {quote.name})
        </span>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">To</p>
          <p className="text-sm">
            {quote.name} &lt;{quote.email}&gt;
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Subject</p>
          <p className="text-sm font-medium">{resolvedSubject}</p>
        </div>
        <hr />
        <div className="text-sm whitespace-pre-wrap leading-relaxed">
          {resolvedBody}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function EmailComposePage() {
  const { isLoaded, isSignedIn } = useAuth()
  const [searchParams] = useSearchParams()
  const [selectedTemplateId, setSelectedTemplateId] = useState(TEMPLATES[0].id)
  const [subject, setSubject] = useState(TEMPLATES[0].subject)
  const [body, setBody] = useState(TEMPLATES[0].body)
  const [showPreview, setShowPreview] = useState(true)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  // Load selected quotes from query params
  const selectedQuotes = useMemo(() => {
    const ids = searchParams.get("ids")
    if (!ids) return []
    const idList = ids.split(",").filter(Boolean)
    const allQuotes = listQuotes()
    return idList
      .map((id) => allQuotes.find((q) => q.id === id))
      .filter((q): q is Quote => q !== null && q !== undefined)
  }, [searchParams])

  // Preview with first quote
  const previewQuote = selectedQuotes[0] ?? null

  const handleTemplateChange = (templateId: string) => {
    const template = TEMPLATES.find((t) => t.id === templateId)
    if (!template) return
    setSelectedTemplateId(templateId)
    setSubject(template.subject)
    setBody(template.body)
  }

  const handleInsertField = (field: MergeFieldKey) => {
    const textarea = document.getElementById(
      "email-body"
    ) as HTMLTextAreaElement | null
    if (!textarea) {
      setBody((prev) => prev + `{{${field}}}`)
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const tag = `{{${field}}}`
    const newBody = body.slice(0, start) + tag + body.slice(end)
    setBody(newBody)
    // Restore cursor after tag
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start + tag.length, start + tag.length)
    })
  }

  const handleSend = () => {
    setSending(true)
    // Simulate send — in production this would call a backend API
    setTimeout(() => {
      setSending(false)
      setSent(true)
    }, 1500)
  }

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (sent) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="rounded-lg border p-8 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <Send className="h-5 w-5 text-green-700" />
          </div>
          <h2 className="text-lg font-semibold">Emails sent</h2>
          <p className="text-sm text-muted-foreground">
            Successfully sent to {selectedQuotes.length} recipient
            {selectedQuotes.length !== 1 ? "s" : ""}.
          </p>
          <Link
            to="/admin/quotes"
            className="inline-block mt-4 text-sm text-primary hover:underline"
          >
            Back to quotes
          </Link>
        </div>
      </div>
    )
  }

  if (selectedQuotes.length === 0) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          to="/admin/quotes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to quotes
        </Link>
        <div className="rounded-lg border p-8 text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            No quotes selected. Please select quotes from the quotes list first.
          </p>
          <Link
            to="/admin/quotes"
            className="inline-block mt-2 text-sm text-primary hover:underline"
          >
            Go to quotes
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/admin/quotes"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to quotes
          </Link>
          <h1 className="text-2xl font-semibold">Compose Email</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Send an email to {selectedQuotes.length} selected quote
            {selectedQuotes.length !== 1 ? "s" : ""}.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Left — editor */}
        <div className="space-y-5">
          <RecipientList quotes={selectedQuotes} />

          <TemplatePicker
            templates={TEMPLATES}
            selectedId={selectedTemplateId}
            onSelect={handleTemplateChange}
          />

          {/* Subject */}
          <div>
            <label htmlFor="email-subject" className="block text-sm font-medium mb-1.5">
              Subject
            </label>
            <input
              id="email-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="email-body" className="block text-sm font-medium">
                Body
              </label>
              <MergeFieldButtons onInsert={handleInsertField} />
            </div>
            <textarea
              id="email-body"
              rows={12}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none font-mono leading-relaxed"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button onClick={handleSend} disabled={sending || !subject.trim() || !body.trim()}>
              <Send className="h-4 w-4 mr-2" />
              {sending ? "Sending…" : `Send to ${selectedQuotes.length} recipient${selectedQuotes.length !== 1 ? "s" : ""}`}
            </Button>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={cn(
                "rounded-md border px-3 py-2 text-sm font-medium transition-colors lg:hidden",
                showPreview
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-input hover:bg-accent"
              )}
            >
              <Eye className="h-4 w-4 inline mr-1.5" />
              Preview
            </button>
          </div>
        </div>

        {/* Right — preview */}
        <div className={cn("space-y-4", !showPreview && "hidden lg:block")}>
          {previewQuote && (
            <PreviewPanel
              subject={subject}
              body={body}
              quote={previewQuote}
            />
          )}
        </div>
      </div>
    </div>
  )
}
