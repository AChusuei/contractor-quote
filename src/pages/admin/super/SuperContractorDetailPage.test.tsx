import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { z } from "zod"
import { SuperContractorDetailPage } from "./SuperContractorDetailPage"

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: async () => "test-token" }),
}))

const mockApiGet = vi.fn()
const mockApiPatch = vi.fn()
const mockApiPost = vi.fn()
vi.mock("@/lib/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPatch: (...args: unknown[]) => mockApiPatch(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  setAuthProvider: vi.fn(),
}))

vi.mock("@/hooks/useAutoSave", () => ({
  useAutoSave: () => ({ trigger: vi.fn(), status: "idle" }),
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

vi.mock("@/components/forms/ContractorProfileForm", () => ({
  contractorProfileSchema: z.object({
    name: z.string(),
    email: z.string(),
    phone: z.string(),
    address: z.string(),
    website: z.string(),
    licenseNumber: z.string(),
    slug: z.string(),
  }),
  ContractorProfileForm: () => <div data-testid="contractor-profile-form" />,
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_CONTRACTOR = {
  id: "c-123",
  slug: "acme-cabinets",
  name: "Acme Cabinets",
  email: "acme@example.com",
  phone: null,
  address: null,
  websiteUrl: null,
  licenseNumber: null,
  logoUrl: null,
  billingStatus: "active",
  monthlyRateCents: 4900,
  billingExempt: false,
  paddleCustomerId: "ctm_abc123",
  gracePeriodEndsAt: null,
  quoteCount: 5,
  customerCount: 3,
  staff: [],
}

function renderPage(id = "c-123") {
  return render(
    <MemoryRouter initialEntries={[`/admin/contractors/${id}`]}>
      <Routes>
        <Route path="/admin/contractors/:id" element={<SuperContractorDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SuperContractorDetailPage", () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
    mockApiGet.mockResolvedValue({ ok: true, data: MOCK_CONTRACTOR })
    mockApiPatch.mockResolvedValue({ ok: true, data: { updated: true } })
    mockApiPost.mockResolvedValue({ ok: true, data: { updated: true } })
  })

  it("renders contractor name and billing status", async () => {
    renderPage()
    expect(await screen.findByText("Acme Cabinets")).toBeInTheDocument()
    expect(screen.getByText("active")).toBeInTheDocument()
  })

  it("renders paddle customer id as read-only", async () => {
    renderPage()
    await screen.findByText("Acme Cabinets")
    expect(screen.getByText("ctm_abc123")).toBeInTheDocument()
  })

  it("pre-fills monthly rate from monthlyRateCents", async () => {
    renderPage()
    await screen.findByText("Acme Cabinets")
    const rateInput = screen.getByPlaceholderText(/49\.00/i) as HTMLInputElement
    expect(rateInput.value).toBe("49")
  })

  it("Save Billing calls PATCH with correct payload", async () => {
    renderPage()
    await screen.findByText("Acme Cabinets")

    await user.click(screen.getByRole("button", { name: /save billing/i }))

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith(
        "/platform/contractors/c-123/billing",
        expect.objectContaining({ monthly_rate_cents: 4900, billing_exempt: false })
      )
    })
  })

  it("shows override button when billing_status is suspended", async () => {
    mockApiGet.mockResolvedValue({
      ok: true,
      data: { ...MOCK_CONTRACTOR, billingStatus: "suspended", gracePeriodEndsAt: "2026-05-01" },
    })
    renderPage()
    await screen.findByText("Acme Cabinets")
    expect(screen.getByRole("button", { name: /override.*clear suspension/i })).toBeInTheDocument()
    expect(screen.getByText(/grace period ends/i)).toBeInTheDocument()
  })

  it("override suspension calls POST endpoint", async () => {
    mockApiGet.mockResolvedValue({
      ok: true,
      data: { ...MOCK_CONTRACTOR, billingStatus: "suspended" },
    })
    vi.spyOn(window, "confirm").mockReturnValue(true)
    renderPage()
    await screen.findByText("Acme Cabinets")

    await user.click(screen.getByRole("button", { name: /override.*clear suspension/i }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        "/platform/contractors/c-123/billing/override-suspension",
        {}
      )
    })
  })

  it("does not show override button for active billing", async () => {
    renderPage()
    await screen.findByText("Acme Cabinets")
    expect(screen.queryByRole("button", { name: /override/i })).not.toBeInTheDocument()
  })
})
