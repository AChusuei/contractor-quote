import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import type * as ReactRouterDom from "react-router-dom"
import { QuotesPage } from "./QuotesPage"
import { QUOTE_STATUSES } from "@/lib/statusTransitions"

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof ReactRouterDom>()
  return { ...mod, useNavigate: () => mockNavigate }
})

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: async () => "test-token" }),
}))

const mockContractorSession = {
  contractorId: "ctr-1",
  contractorName: "Test Co",
  isSuperAdmin: false,
  contractors: [],
  logoUrl: null,
  loading: false,
  noAccess: false,
  error: null,
}
vi.mock("@/contexts/ContractorSession", () => ({
  useContractorSession: () => mockContractorSession,
}))

const mockApiGet = vi.fn()
vi.mock("@/lib/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  isNetworkError: () => false,
  setAuthProvider: vi.fn(),
}))

vi.mock("@/lib/quotes", () => ({
  fetchQuotes: () => Promise.resolve([]),
}))

// Mock DataTable to render rows in a predictable way for testing
vi.mock("components", async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>()
  return {
    ...mod,
    DataTable: ({ data, columns, isLoading, error, onRowClick }: {
      data: Array<Record<string, unknown>>
      columns: Array<{ id: string; cell?: (ctx: { getValue: () => unknown }) => React.ReactNode }>
      isLoading?: boolean
      error?: string | null
      onRowClick?: (row: Record<string, unknown>) => void
    }) => {
      if (isLoading) return <p>Loading…</p>
      if (error) return <p role="alert">{error}</p>
      return (
        <table>
          <tbody>
            {data.map((row) => (
              <tr
                key={row.id as string}
                data-testid={`row-${row.id as string}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.id}>
                    {col.cell
                      ? col.cell({ getValue: () => row[col.id] })
                      : String(row[col.id] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    },
  }
})

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeQuote(status: string, id = `q-${status}`) {
  return {
    id,
    name: "Jane Smith",
    jobSiteAddress: "123 Main St",
    propertyType: "house",
    budgetRange: "25-50k",
    scope: { scopeType: "supply_install", layoutChanges: "no", kitchenSize: "medium" },
    createdAt: "2026-01-01T00:00:00Z",
    status,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <QuotesPage />
    </MemoryRouter>
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("QuotesPage", () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockApiGet.mockResolvedValue({
      ok: true,
      data: { quotes: [makeQuote("lead")], total: 1, page: 1 },
    })
    // Reset session context to default (not loading)
    mockContractorSession.loading = false
    mockContractorSession.contractorId = "ctr-1"
  })

  it("shows Loading… while ContractorSession is loading", () => {
    mockContractorSession.loading = true
    mockContractorSession.contractorId = ""
    renderPage()
    expect(screen.getByText("Loading…")).toBeInTheDocument()
  })

  it("renders quote rows once data loads", async () => {
    renderPage()
    expect(await screen.findByTestId("row-q-lead")).toBeInTheDocument()
  })

  it("clicking a row navigates to /admin/quotes/:id", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByTestId("row-q-lead"))
    expect(mockNavigate).toHaveBeenCalledWith("/admin/quotes/q-lead")
  })

  describe("status cell — regression: all statuses render without crashing", () => {
    it("renders a label for every known QuoteStatus", async () => {
      const quotes = QUOTE_STATUSES.map((s) => makeQuote(s))
      mockApiGet.mockResolvedValue({
        ok: true,
        data: { quotes, total: quotes.length, page: 1 },
      })
      renderPage()
      // All status cells must render without throwing
      for (const status of QUOTE_STATUSES) {
        // The cell renders a <span> with the label text
        expect(await screen.findByTestId(`row-q-${status}`)).toBeInTheDocument()
      }
    })

    it("does not crash for an unknown status value", async () => {
      mockApiGet.mockResolvedValue({
        ok: true,
        data: { quotes: [makeQuote("unknown_future_status", "q-unknown")], total: 1, page: 1 },
      })
      // Should render without throwing
      renderPage()
      expect(await screen.findByTestId("row-q-unknown")).toBeInTheDocument()
    })
  })

  it("shows API error message when load fails", async () => {
    mockApiGet.mockResolvedValue({ ok: false, error: "Not found" })
    renderPage()
    expect(await screen.findByRole("alert")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent(/not found/i)
  })

  it("does not show loading spinner once data arrives", async () => {
    renderPage()
    await screen.findByTestId("row-q-lead")
    expect(screen.queryByText("Loading…")).toBeNull()
  })
})
