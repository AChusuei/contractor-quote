import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import type * as ReactRouterDom from "react-router-dom"
import { CustomerDetailPage } from "./CustomerDetailPage"

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
vi.mock("@/lib/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPatch: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  apiDelete: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  setAuthProvider: vi.fn(),
}))

vi.mock("@/components/forms/CustomerInfoForm", async () => {
  const { z } = await import("zod")
  return {
    CustomerInfoForm: () => <div data-testid="customer-info-form" />,
    customerInfoSchema: z.object({}).passthrough(),
  }
})

vi.mock("@/hooks/useAutoSave", () => ({
  useAutoSave: () => ({ trigger: vi.fn(), flush: vi.fn().mockResolvedValue(undefined) }),
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

const MOCK_CUSTOMER_API = {
  id: "cust-1",
  name: "Jane Smith",
  email: "jane@example.com",
  phone: "555-111-2222",
  howDidYouFindUs: "google",
  referredByContractor: null,
  quotes: [],
}

function renderPage(customerId = "cust-1") {
  return render(
    <MemoryRouter initialEntries={[`/admin/customers/${customerId}`]}>
      <Routes>
        <Route path="/admin/customers/:id" element={<CustomerDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CustomerDetailPage", () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockApiGet.mockReset()
    mockApiGet.mockResolvedValue({ ok: true, data: MOCK_CUSTOMER_API })
  })

  it("renders customer name", async () => {
    renderPage()
    expect(await screen.findByText("Jane Smith")).toBeInTheDocument()
  })

  it("renders email link with correct mailto href", async () => {
    renderPage()
    await screen.findByText("Jane Smith")
    const emailLink = screen.getByRole("link", { name: /email jane@example\.com/i })
    expect(emailLink).toHaveAttribute("href", "mailto:jane@example.com")
  })

  it("does not render email link when email is absent", async () => {
    mockApiGet.mockResolvedValue({
      ok: true,
      data: { ...MOCK_CUSTOMER_API, email: "" },
    })
    renderPage()
    await screen.findByText("Jane Smith")
    expect(screen.queryByRole("link", { name: /email/i })).not.toBeInTheDocument()
  })
})
