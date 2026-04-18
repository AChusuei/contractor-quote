import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import type * as ReactRouterDom from "react-router-dom"
import { IntakeReviewPage } from "./IntakeReviewPage"

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof ReactRouterDom>()
  return { ...mod, useNavigate: () => mockNavigate }
})

vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: () => {} }))

vi.mock("@/hooks/useContractor", () => ({
  useContractor: () => ({
    contractor: { id: "ctr-1", slug: "test", name: "Test Co", logoUrl: null, calendarUrl: null, phone: null },
    loading: false,
    error: null,
  }),
}))

const mockApiGet = vi.fn()
const mockApiPatch = vi.fn()
vi.mock("@/lib/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPatch: (...args: unknown[]) => mockApiPatch(...args),
  isNetworkError: () => false,
}))

vi.mock("@/lib/supabase", () => ({
  getQuotePhotos: () => Promise.resolve([]),
}))

vi.mock("@/lib/quoteStore", () => ({
  getQuote: () => null,
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_QUOTE = {
  id: "q-1",
  name: "Jane Smith",
  email: "jane@example.com",
  phone: "555-123-4567",
  cell: null,
  jobSiteAddress: "123 Main St, Atlanta GA",
  propertyType: "house",
  budgetRange: "25-50k",
  howDidYouFindUs: "google",
  referredByContractor: null,
  scope: {
    scopeType: "supply_install",
    layoutChanges: "no",
    kitchenSize: "medium",
    cabinets: "new",
    cabinetDoorStyle: "Shaker",
    countertopMaterial: "Quartz",
    countertopEdge: "Eased",
    sinkType: "Undermount single basin",
    backsplash: "yes",
    flooringAction: "keep",
    applianceFridge: "new",
    applianceRange: "existing",
    applianceDishwasher: "none",
    applianceHood: "none",
    applianceMicrowave: "none",
    islandPeninsula: "none",
    designHelp: "no",
    additionalNotes: null,
  },
  status: "draft",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <IntakeReviewPage />
    </MemoryRouter>
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("IntakeReviewPage", () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
    mockNavigate.mockReset()
    mockApiGet.mockResolvedValue({ ok: true, data: MOCK_QUOTE })
    mockApiPatch.mockResolvedValue({ ok: true, data: {} })
    sessionStorage.setItem("cq_active_quote_id", "q-1")
    sessionStorage.setItem("cq_public_token", "tok-abc")
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it("renders customer info after loading", async () => {
    renderPage()
    expect(await screen.findByText("Jane Smith")).toBeInTheDocument()
    expect(screen.getByText("jane@example.com")).toBeInTheDocument()
    expect(screen.getByText("123 Main St, Atlanta GA")).toBeInTheDocument()
  })

  it("renders project scope section", async () => {
    renderPage()
    await screen.findByText("Jane Smith")
    expect(screen.getByText("Project Scope")).toBeInTheDocument()
    expect(screen.getByText("Quartz")).toBeInTheDocument()
  })

  it("customer info Edit link points to /", async () => {
    renderPage()
    await screen.findByText("Jane Smith")
    const editLinks = screen.getAllByRole("link", { name: /edit/i })
    expect(editLinks[0]).toHaveAttribute("href", "/")
  })

  it("scope Edit link points to /intake/scope", async () => {
    renderPage()
    await screen.findByText("Jane Smith")
    const editLinks = screen.getAllByRole("link", { name: /edit/i })
    const scopeEditLink = editLinks.find((l) => l.getAttribute("href") === "/intake/scope")
    expect(scopeEditLink).toBeDefined()
  })

  it("submit calls PATCH with status:lead, clears sessionStorage, navigates to /intake/confirmation", async () => {
    renderPage()
    await screen.findByText("Jane Smith")

    await user.click(screen.getByRole("button", { name: /submit request/i }))

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith(
        expect.stringContaining("/quotes/q-1/draft"),
        expect.objectContaining({ status: "lead" })
      )
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/intake/confirmation")
    })
    expect(sessionStorage.getItem("cq_active_quote_id")).toBeNull()
    expect(sessionStorage.getItem("cq_public_token")).toBeNull()
  })

  it("shows error message when API submit fails, does not navigate", async () => {
    mockApiPatch.mockResolvedValue({ ok: false, error: "Server error" })
    renderPage()
    await screen.findByText("Jane Smith")

    await user.click(screen.getByRole("button", { name: /submit request/i }))

    expect(await screen.findByText(/server error/i)).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalledWith("/intake/confirmation")
  })
})
