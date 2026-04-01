import { useEffect, useState } from "react"
import { useAuth } from "@clerk/clerk-react"
import { apiGet, setAuthProvider } from "@/lib/api"

interface AuditEvent {
  id: string
  actorEmail: string
  actorType: string
  entityType: string
  entityId: string
  action: string
  details: Record<string, unknown> | null
  createdAt: string
}

interface AuditLogResponse {
  events: AuditEvent[]
  total: number
  page: number
  limit: number
}

const ENTITY_TYPES = [
  { value: "", label: "All types" },
  { value: "staff", label: "Staff" },
  { value: "contractor", label: "Contractor" },
  { value: "super_user", label: "Super User" },
]

const ACTION_BADGES: Record<string, string> = {
  create: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  update: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  delete: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  impersonate: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
}

function formatDetails(details: Record<string, unknown> | null): string {
  if (!details) return ""
  return JSON.stringify(details, null, 2)
}

export function SuperAuditLogPage() {
  const { getToken } = useAuth()
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [entityType, setEntityType] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const limit = 50

  useEffect(() => {
    setAuthProvider(() => getToken())
  }, [getToken])

  useEffect(() => {
    setLoading(true)
    setError(null)

    const params = new URLSearchParams({ page: String(page) })
    if (entityType) params.set("entityType", entityType)
    if (dateFrom) params.set("dateFrom", dateFrom)
    if (dateTo) params.set("dateTo", dateTo)

    apiGet<AuditLogResponse>(`/audit-log?${params.toString()}`)
      .then((res) => {
        if (res.ok) {
          setEvents(res.data.events)
          setTotal(res.data.total)
        } else {
          setError("Failed to load audit log")
        }
      })
      .catch(() => setError("Failed to load audit log"))
      .finally(() => setLoading(false))
  }, [page, entityType, dateFrom, dateTo])

  const totalPages = Math.ceil(total / limit)

  function handleFilterChange() {
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          All staff, contractor, and super admin changes
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value)
            handleFilterChange()
          }}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          {ENTITY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value)
            handleFilterChange()
          }}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          placeholder="From"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value)
            handleFilterChange()
          }}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          placeholder="To"
        />
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : events.length === 0 ? (
        <div className="text-sm text-muted-foreground">No audit events found.</div>
      ) : (
        <>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">When</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Actor</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Action</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Entity</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((event) => (
                  <>
                    <tr
                      key={event.id}
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() =>
                        setExpandedId((prev) => (prev === event.id ? null : event.id))
                      }
                    >
                      <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        <div>{event.actorEmail}</div>
                        <div className="text-xs text-muted-foreground">{event.actorType}</div>
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                            ACTION_BADGES[event.action] ?? "bg-muted text-muted-foreground"
                          }`}
                        >
                          {event.action}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div>{event.entityType}</div>
                        <div className="font-mono text-xs text-muted-foreground truncate max-w-[160px]">
                          {event.entityId}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {event.details ? (
                          <span className="underline decoration-dotted cursor-pointer">
                            {expandedId === event.id ? "hide" : "show"}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                    {expandedId === event.id && event.details && (
                      <tr key={`${event.id}-detail`} className="bg-muted/20">
                        <td colSpan={5} className="px-4 py-3">
                          <pre className="text-xs overflow-auto whitespace-pre-wrap text-foreground">
                            {formatDetails(event.details)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages} ({total} events)
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
