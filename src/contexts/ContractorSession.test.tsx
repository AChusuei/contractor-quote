import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type * as ReactRouterDom from "react-router-dom"
import { ContractorSessionProvider, useContractorSession } from "./ContractorSession"

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof ReactRouterDom>()
  return { ...mod, useNavigate: () => mockNavigate }
})

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: async () => "tok" }),
}))

const mockApiGet = vi.fn()
vi.mock("@/lib/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  setAuthProvider: vi.fn(),
}))

vi.mock("@/components/NoContractorAccess", () => ({
  NoContractorAccess: () => <div data-testid="no-access">No contractor access</div>,
}))

// ─── Test consumer ────────────────────────────────────────────────────────────

function TestConsumer() {
  const { contractorId, contractorName, isSuperAdmin, loading, noAccess, error } = useContractorSession()
  if (loading) return <div data-testid="loading">loading</div>
  if (noAccess) return <div data-testid="no-access-consumer">no access</div>
  if (error) return <div data-testid="error">{error}</div>
  return (
    <div>
      <span data-testid="contractor-id">{contractorId}</span>
      <span data-testid="contractor-name">{contractorName}</span>
      <span data-testid="is-super-admin">{isSuperAdmin ? "yes" : "no"}</span>
    </div>
  )
}

function renderProvider() {
  return render(
    <MemoryRouter>
      <ContractorSessionProvider>
        <TestConsumer />
      </ContractorSessionProvider>
    </MemoryRouter>
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ContractorSessionProvider", () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockApiGet.mockReset()
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  describe("regular staff path (no sessionStorage super contractor)", () => {
    beforeEach(() => {
      // Not a platform admin
      mockApiGet.mockImplementation((path: string) => {
        if (path === "/platform/check") return Promise.resolve({ ok: false, error: "Forbidden" })
        if (path === "/me/contractor")
          return Promise.resolve({
            ok: true,
            data: { contractorId: "ctr-staff", contractorName: "Staff Co", role: "estimator" },
          })
        if (path.startsWith("/contractors/"))
          return Promise.resolve({ ok: true, data: { logoUrl: null } })
        return Promise.resolve({ ok: false, error: "Not found" })
      })
    })

    it("shows loading initially", () => {
      renderProvider()
      expect(screen.getByTestId("loading")).toBeInTheDocument()
    })

    it("resolves with the staff member's contractor", async () => {
      renderProvider()
      await waitFor(() => {
        expect(screen.getByTestId("contractor-id")).toHaveTextContent("ctr-staff")
      })
      expect(screen.getByTestId("contractor-name")).toHaveTextContent("Staff Co")
      expect(screen.getByTestId("is-super-admin")).toHaveTextContent("no")
    })
  })

  describe("regular staff — no contractor access", () => {
    beforeEach(() => {
      mockApiGet.mockImplementation((path: string) => {
        if (path === "/platform/check") return Promise.resolve({ ok: false, error: "Forbidden" })
        if (path === "/me/contractor") return Promise.resolve({ ok: false, error: "Not found" })
        return Promise.resolve({ ok: false, error: "Not found" })
      })
    })

    it("renders NoContractorAccess when /me/contractor fails", async () => {
      renderProvider()
      await waitFor(() => {
        expect(screen.getByTestId("no-access")).toBeInTheDocument()
      })
    })
  })

  describe("super admin path — sessionStorage contractor selected", () => {
    beforeEach(() => {
      sessionStorage.setItem("cq_super_contractor_id", "ctr-super")
      sessionStorage.setItem("cq_super_contractor_name", "Super Co")
      mockApiGet.mockResolvedValue({ ok: true, data: [] })
    })

    it("uses sessionStorage values without calling /platform/check", async () => {
      renderProvider()
      await waitFor(() => {
        expect(screen.getByTestId("contractor-id")).toHaveTextContent("ctr-super")
      })
      expect(screen.getByTestId("contractor-name")).toHaveTextContent("Super Co")
      expect(screen.getByTestId("is-super-admin")).toHaveTextContent("yes")

      // Should NOT have called /platform/check
      const platformCheckCalls = mockApiGet.mock.calls.filter((args: string[]) =>
        args[0] === "/platform/check"
      )
      expect(platformCheckCalls).toHaveLength(0)
    })
  })

  describe("super admin path — no sessionStorage contractor", () => {
    beforeEach(() => {
      // Is a platform admin
      mockApiGet.mockImplementation((path: string) => {
        if (path === "/platform/check") return Promise.resolve({ ok: true, data: { isPlatformAdmin: true } })
        return Promise.resolve({ ok: false, error: "Not found" })
      })
    })

    it("navigates to /admin/contractors when no contractor is selected", async () => {
      renderProvider()
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/admin/contractors")
      })
    })
  })
})
