import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { AppointmentConfirmPage } from "./AppointmentConfirmPage"

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

const APPOINTMENT = {
  customerName: "Jane Smith",
  address: "123 Main St, New York, NY 10001",
  proposedTime: "2026-04-10T10:00:00.000Z",
}

function renderPage(token = "tok_abc123") {
  return render(
    <MemoryRouter initialEntries={[`/appointments/${token}`]}>
      <Routes>
        <Route path="/appointments/:token" element={<AppointmentConfirmPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe("AppointmentConfirmPage", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it("shows loading state initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {})) // never resolves
    renderPage()
    expect(screen.getByText(/loading appointment details/i)).toBeInTheDocument()
  })

  it("renders appointment details after load", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => APPOINTMENT,
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Jane Smith")).toBeInTheDocument()
    })
    expect(screen.getByText("123 Main St, New York, NY 10001")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /confirm this time/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /request a different time/i })).toBeInTheDocument()
  })

  it("shows error when API returns 404", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/expired or is no longer valid/i)).toBeInTheDocument()
    })
  })

  it("shows error when API returns non-404 error", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/unable to load appointment details/i)).toBeInTheDocument()
    })
  })

  it("shows error when network fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"))
    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/unable to load appointment details/i)).toBeInTheDocument()
    })
  })

  it("shows confirmed state after confirm", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => APPOINTMENT })
      .mockResolvedValueOnce({ ok: true })

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => screen.getByRole("button", { name: /confirm this time/i }))
    await user.click(screen.getByRole("button", { name: /confirm this time/i }))

    await waitFor(() => {
      expect(screen.getByText(/appointment confirmed/i)).toBeInTheDocument()
    })
  })

  it("shows declined state after requesting different time", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => APPOINTMENT })
      .mockResolvedValueOnce({ ok: true })

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => screen.getByRole("button", { name: /request a different time/i }))
    await user.click(screen.getByRole("button", { name: /request a different time/i }))

    await waitFor(() => {
      expect(screen.getByText(/give you a call/i)).toBeInTheDocument()
    })
  })

  it("shows error if confirm API call fails", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => APPOINTMENT })
      .mockResolvedValueOnce({ ok: false, status: 500 })

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => screen.getByRole("button", { name: /confirm this time/i }))
    await user.click(screen.getByRole("button", { name: /confirm this time/i }))

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    })
  })
})
