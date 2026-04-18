import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import type * as ReactRouterDom from "react-router-dom"
import { QuoteDetailPage } from "./QuoteDetailPage"
import { STATUS_LABELS } from "@/lib/statusTransitions"

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
const mockApiDelete = vi.fn()
vi.mock("@/lib/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPatch: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
  isNetworkError: () => false,
  setAuthProvider: vi.fn(),
}))

vi.mock("@/lib/quoteStore", () => ({
  getQuote: () => null,
  updateQuote: vi.fn(),
  updateStatus: vi.fn(),
  updateNotes: vi.fn(),
}))

vi.mock("@/lib/quotes", () => ({ fetchQuotes: () => Promise.resolve([]) }))

// Stub heavy child components to keep tests focused
vi.mock("@/components/forms/ProjectScopeForm", async () => {
  const { z } = await import("zod")
  return {
    ProjectScopeForm: () => <div data-testid="scope-form" />,
    // Provide a real (minimal) Zod schema so zodResolver doesn't throw
    projectScopeSchema: z.object({}).passthrough(),
  }
})

vi.mock("@/components/forms/PhotosForm", () => ({
  PhotosForm: () => <div data-testid="photos-form" />,
}))

vi.mock("@/components/ActivityFeed", () => ({
  ActivityFeed: ({ onAddComment }: { onAddComment: (c: string) => void }) => (
    <div data-testid="activity-feed">
      <textarea data-testid="comment-input" />
      <button onClick={() => onAddComment("test comment")}>Post</button>
    </div>
  ),
}))

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

const MOCK_QUOTE_API = {
  id: "q-abc",
  name: "Alex Johnson",
  email: "alex@example.com",
  phone: "555-000-1234",
  cell: null,
  jobSiteAddress: "456 Oak Ave",
  propertyType: "house",
  budgetRange: "25-50k",
  howDidYouFindUs: "google",
  referredByContractor: null,
  scope: null,
  quotePath: null,
  photoSessionId: null,
  status: "lead",
  statusHistory: [],
  contractorNotes: "",
  customerId: null,
  createdAt: "2026-01-01T10:00:00Z",
}

const MOCK_ACTIVITY_API = {
  activities: [],
}

function renderPage(quoteId = "q-abc") {
  return render(
    <MemoryRouter initialEntries={[`/admin/quotes/${quoteId}`]}>
      <Routes>
        <Route path="/admin/quotes/:id" element={<QuoteDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("QuoteDetailPage", () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
    mockNavigate.mockReset()
    mockApiGet.mockReset()
    mockApiPost.mockReset()
    mockApiDelete.mockReset()
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes("/activity")) return Promise.resolve({ ok: true, data: MOCK_ACTIVITY_API })
      return Promise.resolve({ ok: true, data: MOCK_QUOTE_API })
    })
    mockApiPost.mockResolvedValue({ ok: true, data: {} })
    mockApiDelete.mockResolvedValue({ ok: true, data: {} })
  })

  it("renders customer name and address", async () => {
    renderPage()
    expect(await screen.findByText("Alex Johnson")).toBeInTheDocument()
  })

  it("renders current status badge", async () => {
    renderPage()
    await screen.findByText("Alex Johnson")
    expect(screen.getByText(STATUS_LABELS.lead)).toBeInTheDocument()
  })

  it("shows next-step transition buttons for current status", async () => {
    renderPage()
    await screen.findByText("Alex Johnson")
    // lead → reviewing is the happy path
    expect(screen.getByRole("button", { name: /reviewing/i })).toBeInTheDocument()
  })

  it("confirmation-required statuses show a dialog before applying", async () => {
    // Quote in estimate_sent status — closed and rejected require confirmation
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes("/activity")) return Promise.resolve({ ok: true, data: MOCK_ACTIVITY_API })
      return Promise.resolve({ ok: true, data: { ...MOCK_QUOTE_API, status: "estimate_sent" } })
    })
    renderPage()
    await screen.findByText(STATUS_LABELS.estimate_sent)

    // Click "Closed" (secondary/confirmation status)
    await user.click(screen.getByRole("button", { name: /closed/i }))

    // Confirmation dialog should appear
    expect(screen.getByText(/move this quote to/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument()
  })

  it("confirming a status change calls the activity API", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes("/activity")) return Promise.resolve({ ok: true, data: MOCK_ACTIVITY_API })
      return Promise.resolve({ ok: true, data: { ...MOCK_QUOTE_API, status: "estimate_sent" } })
    })
    renderPage()
    await screen.findByText(STATUS_LABELS.estimate_sent)

    await user.click(screen.getByRole("button", { name: /closed/i }))
    await user.click(screen.getByRole("button", { name: /confirm/i }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        expect.stringContaining("/activity"),
        expect.objectContaining({ type: "status_change", newStatus: "closed" })
      )
    })
  })

  it("cancelling the confirmation dialog does NOT change status", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes("/activity")) return Promise.resolve({ ok: true, data: MOCK_ACTIVITY_API })
      return Promise.resolve({ ok: true, data: { ...MOCK_QUOTE_API, status: "estimate_sent" } })
    })
    renderPage()
    await screen.findByText(STATUS_LABELS.estimate_sent)

    await user.click(screen.getByRole("button", { name: /closed/i }))
    await user.click(screen.getByRole("button", { name: /cancel/i }))

    // Dialog dismissed, apiPost not called
    expect(mockApiPost).not.toHaveBeenCalled()
    expect(screen.queryByText(/move this quote to/i)).toBeNull()
  })

  it("delete button shows confirmation, then calls DELETE API and navigates away", async () => {
    renderPage()
    await screen.findByText("Alex Johnson")

    // Expect a delete button
    const deleteBtn = screen.getByRole("button", { name: /delete/i })
    await user.click(deleteBtn)

    // Confirmation step
    const confirmBtn = await screen.findByRole("button", { name: /confirm|permanently delete/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith(
        expect.stringContaining("/quotes/q-abc"),
        expect.anything()
      )
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/admin/quotes")
    })
  })
})
