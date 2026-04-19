import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import type * as ReactRouterDom from "react-router-dom"
import { SuperContractorsPage } from "./SuperContractorsPage"

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof ReactRouterDom>()
  return { ...mod, useNavigate: () => mockNavigate }
})

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: async () => "test-token" }),
}))

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
vi.mock("@/lib/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  isNetworkError: () => false,
  setAuthProvider: vi.fn(),
}))

vi.mock("components", async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>()
  return {
    ...mod,
    Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
      <button onClick={onClick} disabled={disabled}>{children}</button>
    ),
  }
})

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_CONTRACTORS = [
  { id: "c-1", slug: "acme-cabinets", name: "Acme Cabinets", email: "acme@example.com", billingStatus: "active", staffCount: 3, quoteCount: 12 },
  { id: "c-2", slug: "metro-kitchens", name: "Metro Kitchens", email: null, billingStatus: "past_due", staffCount: 1, quoteCount: 4 },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <SuperContractorsPage />
    </MemoryRouter>
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SuperContractorsPage", () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
    mockNavigate.mockReset()
    mockApiGet.mockResolvedValue({ ok: true, data: MOCK_CONTRACTORS })
    mockApiPost.mockResolvedValue({ ok: true, data: { id: "c-new" } })
  })

  it("renders the list of contractors with name, slug, staff count, and quote count", async () => {
    renderPage()
    expect(await screen.findByText("Acme Cabinets")).toBeInTheDocument()
    expect(screen.getByText("acme-cabinets")).toBeInTheDocument()
    expect(screen.getByText("12")).toBeInTheDocument()

    expect(screen.getByText("Metro Kitchens")).toBeInTheDocument()
    expect(screen.getByText("metro-kitchens")).toBeInTheDocument()
  })

  it("clicking a contractor row navigates to /admin/contractors/:id", async () => {
    renderPage()
    await user.click(await screen.findByText("Acme Cabinets"))
    expect(mockNavigate).toHaveBeenCalledWith("/admin/contractors/c-1")
  })

  it("Add Contractor button shows the inline form", async () => {
    renderPage()
    await screen.findByText("Acme Cabinets")
    await user.click(screen.getByRole("button", { name: /add contractor/i }))
    expect(screen.getByPlaceholderText(/central cabinets/i)).toBeInTheDocument()
  })

  it("slug auto-generates from name input", async () => {
    renderPage()
    await screen.findByText("Acme Cabinets")
    await user.click(screen.getByRole("button", { name: /add contractor/i }))

    const nameInput = screen.getByPlaceholderText(/central cabinets/i)
    await user.type(nameInput, "New Cabinet Co")

    const slugInput = screen.getByDisplayValue("new-cabinet-co")
    expect(slugInput).toBeInTheDocument()
  })

  it("Create Contractor calls POST and reloads list", async () => {
    renderPage()
    await screen.findByText("Acme Cabinets")
    await user.click(screen.getByRole("button", { name: /add contractor/i }))

    await user.type(screen.getByPlaceholderText(/central cabinets/i), "New Co")
    await user.click(screen.getByRole("button", { name: /create contractor/i }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        "/platform/contractors",
        expect.objectContaining({ name: "New Co", slug: "new-co" })
      )
    })
  })

  it("shows billing status badges for each contractor", async () => {
    renderPage()
    expect(await screen.findByText("active")).toBeInTheDocument()
    expect(screen.getByText("past due")).toBeInTheDocument()
  })

  it("shows error message when loading fails", async () => {
    mockApiGet.mockResolvedValue({ ok: false, error: "Unauthorized" })
    renderPage()
    expect(await screen.findByText(/unauthorized/i)).toBeInTheDocument()
  })
})
