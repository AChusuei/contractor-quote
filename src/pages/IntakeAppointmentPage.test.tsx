import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function renderPage() {
  const { IntakeAppointmentPage } = await import("./IntakeAppointmentPage")
  return render(
    <MemoryRouter>
      <IntakeAppointmentPage />
    </MemoryRouter>
  )
}

describe("IntakeAppointmentPage", () => {
  it("renders step header and heading", async () => {
    vi.stubEnv("VITE_CQ_GOOGLE_APPOINTMENT_URL", "https://calendar.google.com/test")
    await renderPage()
    expect(screen.getByText("Step 4 of 4")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Preferred Site Visit Appointment" })).toBeInTheDocument()
  })

  it("renders iframe when appointment URL is configured", async () => {
    vi.stubEnv("VITE_CQ_GOOGLE_APPOINTMENT_URL", "https://calendar.google.com/test")
    await renderPage()
    const iframe = screen.getByTitle("Schedule an appointment")
    expect(iframe).toBeInTheDocument()
    expect(iframe).toHaveAttribute("src", "https://calendar.google.com/test")
  })

  it("renders fallback message when appointment URL is not configured", async () => {
    vi.stubEnv("VITE_CQ_GOOGLE_APPOINTMENT_URL", "")
    await renderPage()
    expect(screen.queryByTitle("Schedule an appointment")).not.toBeInTheDocument()
    expect(screen.getByText(/appointment scheduling is not configured/i)).toBeInTheDocument()
  })
})
