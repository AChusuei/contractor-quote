import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { IntakeAppointmentPage } from "./IntakeAppointmentPage"

const mockNavigate = vi.fn()
vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>()
  return { ...mod, useNavigate: () => mockNavigate }
})

const mockFetchSlots = vi.fn()
const mockSaveSelection = vi.fn()
vi.mock("@/lib/appointments", () => ({
  fetchAppointmentSlots: () => mockFetchSlots(),
  saveAppointmentSelection: (...args: unknown[]) => mockSaveSelection(...args),
}))

const MOCK_SLOTS = [
  {
    id: "2026-03-23-morning",
    label: "Mon, Mar 23 · Morning (9am – 12pm)",
    startAt: "2026-03-23T09:00:00",
    endAt: "2026-03-23T12:00:00",
  },
  {
    id: "2026-03-23-afternoon",
    label: "Mon, Mar 23 · Afternoon (1pm – 5pm)",
    startAt: "2026-03-23T13:00:00",
    endAt: "2026-03-23T17:00:00",
  },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <IntakeAppointmentPage />
    </MemoryRouter>
  )
}

describe("IntakeAppointmentPage", () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockFetchSlots.mockReset()
    mockSaveSelection.mockReset()
    mockFetchSlots.mockResolvedValue(MOCK_SLOTS)
  })

  it("renders step header", async () => {
    renderPage()
    expect(screen.getByText("Step 3 of 5")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Preferred Appointment" })).toBeInTheDocument()
  })

  it("shows appointment slots after loading", async () => {
    renderPage()
    expect(await screen.findByText("Mon, Mar 23 · Morning (9am – 12pm)")).toBeInTheDocument()
    expect(screen.getByText("Mon, Mar 23 · Afternoon (1pm – 5pm)")).toBeInTheDocument()
  })

  it("shows flexible option after loading", async () => {
    renderPage()
    expect(await screen.findByText(/flexible — contact me to schedule/i)).toBeInTheDocument()
  })

  it("Continue is disabled until a selection is made", async () => {
    renderPage()
    await screen.findByText("Mon, Mar 23 · Morning (9am – 12pm)")
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled()
  })

  it("enables Continue after selecting a slot", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText("Mon, Mar 23 · Morning (9am – 12pm)"))
    expect(screen.getByRole("button", { name: /continue/i })).not.toBeDisabled()
  })

  it("enables Continue after selecting flexible", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText(/flexible — contact me to schedule/i))
    expect(screen.getByRole("button", { name: /continue/i })).not.toBeDisabled()
  })

  it("navigates to /intake/photos after selecting a slot and clicking Continue", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText("Mon, Mar 23 · Morning (9am – 12pm)"))
    await user.click(screen.getByRole("button", { name: /continue/i }))
    expect(mockNavigate).toHaveBeenCalledWith("/intake/photos")
  })

  it("saves slot selection on continue", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText("Mon, Mar 23 · Morning (9am – 12pm)"))
    await user.click(screen.getByRole("button", { name: /continue/i }))
    expect(mockSaveSelection).toHaveBeenCalledWith({
      type: "slot",
      slotId: "2026-03-23-morning",
      startAt: "2026-03-23T09:00:00",
      endAt: "2026-03-23T12:00:00",
      status: "pending",
    })
  })

  it("navigates to /intake/photos after selecting flexible and clicking Continue", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText(/flexible — contact me to schedule/i))
    await user.click(screen.getByRole("button", { name: /continue/i }))
    expect(mockNavigate).toHaveBeenCalledWith("/intake/photos")
  })

  it("saves flexible selection on continue", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText(/flexible — contact me to schedule/i))
    await user.click(screen.getByRole("button", { name: /continue/i }))
    expect(mockSaveSelection).toHaveBeenCalledWith({ type: "flexible", status: "pending" })
  })

  it("shows error message when slots fail to load", async () => {
    mockFetchSlots.mockRejectedValue(new Error("Network error"))
    renderPage()
    expect(await screen.findByText(/couldn't load appointment times/i)).toBeInTheDocument()
  })

  it("does not navigate when Continue is clicked with no selection", async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText("Mon, Mar 23 · Morning (9am – 12pm)")
    // Continue is disabled, clicking it should do nothing
    await user.click(screen.getByRole("button", { name: /continue/i }))
    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalled()
    })
  })
})
