import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { IntakePhotosPage } from "./IntakePhotosPage"

const mockNavigate = vi.fn()
vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>()
  return { ...mod, useNavigate: () => mockNavigate }
})

vi.mock("@/lib/supabase", () => ({
  uploadQuotePhoto: vi.fn().mockResolvedValue("test/photo.jpg"),
}))

function renderPhotosPage() {
  return render(
    <MemoryRouter>
      <IntakePhotosPage />
    </MemoryRouter>
  )
}

describe("IntakePhotosPage", () => {
  beforeEach(() => {
    mockNavigate.mockReset()
  })

  it("renders step header", () => {
    renderPhotosPage()
    expect(screen.getByText("Step 4 of 5")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Photos" })).toBeInTheDocument()
  })

  it("shows upload area", () => {
    renderPhotosPage()
    expect(screen.getByText(/drag & drop files here/i)).toBeInTheDocument()
  })

  it("shows Continue button", () => {
    renderPhotosPage()
    expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument()
  })

  it("shows Skip button when no photos uploaded", () => {
    renderPhotosPage()
    expect(screen.getByRole("button", { name: /skip/i })).toBeInTheDocument()
  })

  it("navigates to /intake/review when Continue is clicked", async () => {
    const user = userEvent.setup()
    renderPhotosPage()
    await user.click(screen.getByRole("button", { name: /continue/i }))
    expect(mockNavigate).toHaveBeenCalledWith("/intake/review")
  })

  it("navigates to /intake/review when Skip is clicked", async () => {
    const user = userEvent.setup()
    renderPhotosPage()
    await user.click(screen.getByRole("button", { name: /skip/i }))
    expect(mockNavigate).toHaveBeenCalledWith("/intake/review")
  })
})
