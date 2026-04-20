import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { SettingsPage } from "./SettingsPage"

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: async () => "test-token" }),
}))

const mockContractorSession = {
  contractorId: "ctr-1",
  contractorName: "Test Co",
  isSuperAdmin: false,
  contractors: [],
  logoUrl: null,
  userRole: "owner",
  billingStatus: null,
  loading: false,
  noAccess: false,
  error: null,
}

vi.mock("@/contexts/ContractorSession", () => ({
  useContractorSession: () => mockContractorSession,
}))

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiDelete = vi.fn()
vi.mock("@/lib/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
  apiPatch: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  apiUpload: vi.fn().mockResolvedValue({ ok: true, data: { logoUrl: "" } }),
  isNetworkError: () => false,
  setAuthProvider: vi.fn(),
}))

vi.mock("@/components/forms/ContractorProfileForm", async () => {
  const { z } = await import("zod")
  return {
    ContractorProfileForm: () => <div data-testid="contractor-profile-form" />,
    contractorProfileSchema: z.object({}).passthrough(),
  }
})

vi.mock("@/hooks/useAutoSave", () => ({
  useAutoSave: () => ({ trigger: vi.fn() }),
}))

vi.mock("components", async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>()
  return {
    ...mod,
    Button: ({
      children,
      onClick,
      disabled,
      type,
      className,
    }: {
      children: React.ReactNode
      onClick?: () => void
      disabled?: boolean
      type?: string
      className?: string
    }) => (
      <button onClick={onClick} disabled={disabled} type={type as "button" | "submit" | "reset" | undefined} className={className}>
        {children}
      </button>
    ),
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BILLING_DATA = {
  billingStatus: "active",
  monthlyRateCents: 4900,
  nextBillingDate: "2026-05-19",
  paddleCustomerId: "***4lu14d3d",
  gracePeriodEndsAt: null,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SettingsPage — Billing tab visibility", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_CQ_BILLING_ENABLED", "true")
    mockApiGet.mockResolvedValue({ ok: true, data: { name: "Test Co", email: "", phone: "", address: "", websiteUrl: "", licenseNumber: "", logoUrl: null } })
    mockApiPost.mockResolvedValue({ ok: true, data: { portalUrl: "https://portal.paddle.com/xxx" } })
    mockApiDelete.mockResolvedValue({ ok: true, data: { canceled: true } })
  })

  it("shows Billing tab for owner", () => {
    mockContractorSession.userRole = "owner"
    renderPage()
    expect(screen.getByRole("button", { name: "Billing" })).toBeInTheDocument()
  })

  it("shows Billing tab for admin", () => {
    mockContractorSession.userRole = "admin"
    renderPage()
    expect(screen.getByRole("button", { name: "Billing" })).toBeInTheDocument()
  })

  it("hides Billing tab for estimator", () => {
    mockContractorSession.userRole = "estimator"
    renderPage()
    expect(screen.queryByRole("button", { name: "Billing" })).not.toBeInTheDocument()
  })

  it("hides Billing tab for field_tech", () => {
    mockContractorSession.userRole = "field_tech"
    renderPage()
    expect(screen.queryByRole("button", { name: "Billing" })).not.toBeInTheDocument()
  })

  it("hides Billing tab for owner when VITE_CQ_BILLING_ENABLED is not set", () => {
    vi.stubEnv("VITE_CQ_BILLING_ENABLED", "")
    mockContractorSession.userRole = "owner"
    renderPage()
    expect(screen.queryByRole("button", { name: "Billing" })).not.toBeInTheDocument()
  })
})

describe("SettingsPage — Billing tab content", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_CQ_BILLING_ENABLED", "true")
    mockContractorSession.userRole = "owner"
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes("/billing")) {
        return Promise.resolve({ ok: true, data: BILLING_DATA })
      }
      return Promise.resolve({ ok: true, data: { name: "Test Co", email: "", phone: "", address: "", websiteUrl: "", licenseNumber: "", logoUrl: null } })
    })
    mockApiPost.mockResolvedValue({ ok: true, data: { portalUrl: "https://portal.paddle.com/xxx" } })
    mockApiDelete.mockResolvedValue({ ok: true, data: { canceled: true } })
  })

  it("loads and displays billing info when tab is clicked", async () => {
    renderPage()
    await userEvent.click(screen.getByRole("button", { name: "Billing" }))
    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument()
    })
    expect(screen.getByText("$49/mo")).toBeInTheDocument()
    // Date displays as a locale string — just check it contains the year
    expect(screen.getByText(/2026/)).toBeInTheDocument()
  })

  it("shows manage payment method button", async () => {
    renderPage()
    await userEvent.click(screen.getByRole("button", { name: "Billing" }))
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /manage payment method/i })).toBeInTheDocument()
    })
  })

  it("redirects to portal on manage payment click", async () => {
    const assignSpy = vi.fn()
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, set href(v: string) { assignSpy(v) } },
    })
    renderPage()
    await userEvent.click(screen.getByRole("button", { name: "Billing" }))
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /manage payment method/i })).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole("button", { name: /manage payment method/i }))
    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(expect.stringContaining("/billing/portal"))
    })
  })

  it("shows cancel subscription for owner", async () => {
    renderPage()
    await userEvent.click(screen.getByRole("button", { name: "Billing" }))
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /cancel subscription/i })).toBeInTheDocument()
    })
  })

  it("does not show cancel subscription for admin", async () => {
    mockContractorSession.userRole = "admin"
    renderPage()
    await userEvent.click(screen.getByRole("button", { name: "Billing" }))
    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument()
    })
    expect(screen.queryByRole("button", { name: /cancel subscription/i })).not.toBeInTheDocument()
  })

  it("shows confirmation dialog on cancel subscription click", async () => {
    renderPage()
    await userEvent.click(screen.getByRole("button", { name: "Billing" }))
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /cancel subscription/i })).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole("button", { name: /cancel subscription/i }))
    expect(screen.getByText(/cancel your subscription\?/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /yes, cancel subscription/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /keep subscription/i })).toBeInTheDocument()
  })

  it("calls cancel API on confirmation", async () => {
    renderPage()
    await userEvent.click(screen.getByRole("button", { name: "Billing" }))
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /cancel subscription/i })).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole("button", { name: /cancel subscription/i }))
    await userEvent.click(screen.getByRole("button", { name: /yes, cancel subscription/i }))
    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith(expect.stringContaining("/billing/cancel"))
    })
  })

  it("shows billing error when API fails", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes("/billing")) {
        return Promise.resolve({ ok: false, error: "Billing unavailable", code: "INTERNAL_ERROR" })
      }
      return Promise.resolve({ ok: true, data: { name: "Test Co", email: "", phone: "", address: "", websiteUrl: "", licenseNumber: "", logoUrl: null } })
    })
    renderPage()
    await userEvent.click(screen.getByRole("button", { name: "Billing" }))
    await waitFor(() => {
      expect(screen.getByText("Billing unavailable")).toBeInTheDocument()
    })
  })
})
