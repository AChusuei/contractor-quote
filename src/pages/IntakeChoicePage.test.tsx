import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import type * as ReactRouterDom from "react-router-dom"
import { IntakeChoicePage, getQuotePath, saveQuotePath } from "./IntakeChoicePage"

const mockNavigate = vi.fn()
vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof ReactRouterDom>()
  return { ...mod, useNavigate: () => mockNavigate }
})

function renderChoicePage() {
  return render(
    <MemoryRouter>
      <IntakeChoicePage />
    </MemoryRouter>
  )
}

describe("IntakeChoicePage", () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    sessionStorage.clear()
  })

  it("renders step header", () => {
    renderChoicePage()
    expect(screen.getByText("Step 4 of 4")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /how would you like to proceed/i })).toBeInTheDocument()
  })

  it("renders both choice options", () => {
    renderChoicePage()
    expect(screen.getByText(/schedule a site visit/i)).toBeInTheDocument()
    expect(screen.getByText(/get a rough estimate/i)).toBeInTheDocument()
  })

  it("stores site_visit path and navigates to /intake/checkout when site visit is chosen", async () => {
    const user = userEvent.setup()
    renderChoicePage()
    await user.click(screen.getByText(/schedule a site visit/i).closest("button")!)
    expect(getQuotePath()).toBe("site_visit")
    expect(mockNavigate).toHaveBeenCalledWith("/intake/appointment")
  })

  it("stores estimate_requested path and navigates to /intake/estimate when rough estimate is chosen", async () => {
    const user = userEvent.setup()
    renderChoicePage()
    await user.click(screen.getByText(/get a rough estimate/i).closest("button")!)
    expect(getQuotePath()).toBe("estimate_requested")
    expect(mockNavigate).toHaveBeenCalledWith("/intake/estimate")
  })

  it("navigates back when Back is clicked", async () => {
    const user = userEvent.setup()
    renderChoicePage()
    await user.click(screen.getByRole("button", { name: /back/i }))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })
})

describe("saveQuotePath / getQuotePath", () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it("persists site_visit", () => {
    saveQuotePath("site_visit")
    expect(getQuotePath()).toBe("site_visit")
  })

  it("persists estimate_requested", () => {
    saveQuotePath("estimate_requested")
    expect(getQuotePath()).toBe("estimate_requested")
  })

  it("returns null when nothing is stored", () => {
    expect(getQuotePath()).toBeNull()
  })
})
