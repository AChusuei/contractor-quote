import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { NotFoundPage } from "./NotFoundPage"

describe("NotFoundPage", () => {
  it("renders 404 heading and default text", () => {
    render(<NotFoundPage />)
    expect(screen.getByRole("heading", { name: "404" })).toBeInTheDocument()
    expect(screen.getByText("Page not found")).toBeInTheDocument()
  })

  it("renders optional message when provided", () => {
    render(<NotFoundPage message="Contractor not found." />)
    expect(screen.getByText("Contractor not found.")).toBeInTheDocument()
  })

  it("does not render optional message paragraph when omitted", () => {
    render(<NotFoundPage />)
    expect(screen.queryByText("Contractor not found.")).not.toBeInTheDocument()
  })
})
