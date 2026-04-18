import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { SuperAuditLogPage } from "./SuperAuditLogPage"

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: async () => "test-token" }),
}))

const mockApiGet = vi.fn()
vi.mock("@/lib/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  setAuthProvider: vi.fn(),
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEvent(action: string, id = `ev-${action}`) {
  return {
    id,
    actorEmail: "admin@example.com",
    actorType: "super_user",
    entityType: "contractor",
    entityId: "ctr-1",
    action,
    details: action === "update" ? { field: "name", old: "Old", new: "New" } : null,
    createdAt: "2026-01-15T10:00:00Z",
  }
}

const MOCK_RESPONSE = {
  events: [
    makeEvent("create"),
    makeEvent("update"),
    makeEvent("delete"),
    makeEvent("impersonate"),
  ],
  total: 4,
  page: 1,
  limit: 50,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SuperAuditLogPage />
    </MemoryRouter>
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SuperAuditLogPage", () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
    mockApiGet.mockReset()
    mockApiGet.mockResolvedValue({ ok: true, data: MOCK_RESPONSE })
  })

  it("renders audit entries with actor email, action, and entity", async () => {
    renderPage()
    // All 4 events are rendered (each with actor email)
    const emailCells = await screen.findAllByText("admin@example.com")
    expect(emailCells.length).toBeGreaterThanOrEqual(4)
    // Entity type column is present
    expect(screen.getAllByText("contractor").length).toBeGreaterThanOrEqual(1)
  })

  it("renders action type badges for create, update, delete, impersonate", async () => {
    renderPage()
    await screen.findByText("create")
    expect(screen.getByText("create")).toBeInTheDocument()
    expect(screen.getByText("update")).toBeInTheDocument()
    expect(screen.getByText("delete")).toBeInTheDocument()
    expect(screen.getByText("impersonate")).toBeInTheDocument()
  })

  it("action badges carry the correct CSS color classes", async () => {
    renderPage()
    const createBadge = await screen.findByText("create")
    expect(createBadge.className).toContain("green")

    const updateBadge = screen.getByText("update")
    expect(updateBadge.className).toContain("blue")

    const deleteBadge = screen.getByText("delete")
    expect(deleteBadge.className).toContain("red")

    const impersonateBadge = screen.getByText("impersonate")
    expect(impersonateBadge.className).toContain("amber")
  })

  it("clicking a row with details expands the JSON detail panel", async () => {
    renderPage()
    await screen.findByText("update")

    // Row with details shows "show" link
    const showLink = screen.getByText("show")
    await user.click(showLink)

    // Expanded detail shows JSON
    expect(await screen.findByText(/"field"/)).toBeInTheDocument()
  })

  it("clicking expanded row again collapses the detail panel", async () => {
    renderPage()
    await screen.findByText("update")
    await user.click(screen.getByText("show"))
    await screen.findByText(/"field"/)

    await user.click(screen.getByText("hide"))
    await waitFor(() => {
      expect(screen.queryByText(/"field"/)).toBeNull()
    })
  })

  it("entity type filter passes entityType param to the API", async () => {
    renderPage()
    await screen.findByText("create")

    const filter = screen.getByRole("combobox")
    await user.selectOptions(filter, "staff")

    await waitFor(() => {
      // At least one call after filtering must include entityType=staff
      const callsWithStaff = (mockApiGet.mock.calls as [string][]).filter(([path]) =>
        path.includes("entityType=staff")
      )
      expect(callsWithStaff.length).toBeGreaterThanOrEqual(1)
    })
  })

  it("shows error message when load fails", async () => {
    mockApiGet.mockResolvedValue({ ok: false, error: "Forbidden" })
    renderPage()
    expect(await screen.findByText(/failed to load audit log/i)).toBeInTheDocument()
  })

  it("shows 'No audit events found' when results are empty", async () => {
    mockApiGet.mockResolvedValue({ ok: true, data: { events: [], total: 0, page: 1, limit: 50 } })
    renderPage()
    expect(await screen.findByText(/no audit events found/i)).toBeInTheDocument()
  })
})
