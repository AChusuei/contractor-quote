import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { IntakeScreen2Page } from "./IntakeScreen2Page"

const mockNavigate = vi.fn()
vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>()
  return { ...mod, useNavigate: () => mockNavigate }
})

// These are the exact values defined in IntakeScreen2Page constants
const COUNTERTOP_MATERIALS = [
  "Quartz",
  "Granite",
  "Marble",
  "Quartzite",
  "Butcher block",
  "Concrete",
  "Laminate",
  "Solid surface (Corian)",
  "Porcelain / tile",
  "Stainless steel",
  "Soapstone",
  "Undecided",
  "Other",
]

const COUNTERTOP_EDGES = [
  "Eased",
  "Beveled",
  "Bullnose",
  "Half bullnose",
  "Ogee",
  "Waterfall / mitered",
  "Pencil / micro bevel",
  "Undecided",
  "Other",
]

function renderScreen2() {
  return render(
    <MemoryRouter>
      <IntakeScreen2Page />
    </MemoryRouter>
  )
}

describe("IntakeScreen2Page — countertop material dropdown", () => {
  it("renders all COUNTERTOP_MATERIALS as select options", () => {
    renderScreen2()
    const select = screen.getByRole("combobox", { name: /countertop material/i })
    const options = Array.from(select.querySelectorAll("option"))
      .filter((o) => o.value !== "") // exclude placeholder
      .map((o) => o.textContent)

    expect(options).toEqual(COUNTERTOP_MATERIALS)
  })

  it("allows selecting a countertop material", async () => {
    const user = userEvent.setup()
    renderScreen2()
    const select = screen.getByRole("combobox", { name: /countertop material/i })
    await user.selectOptions(select, "Quartz")
    expect((select as HTMLSelectElement).value).toBe("Quartz")
  })
})

describe("IntakeScreen2Page — edge profile dropdown", () => {
  it("renders all COUNTERTOP_EDGES as select options", () => {
    renderScreen2()
    const select = screen.getByRole("combobox", { name: /edge profile/i })
    const options = Array.from(select.querySelectorAll("option"))
      .filter((o) => o.value !== "")
      .map((o) => o.textContent)

    expect(options).toEqual(COUNTERTOP_EDGES)
  })

  it("allows selecting an edge profile", async () => {
    const user = userEvent.setup()
    renderScreen2()
    const select = screen.getByRole("combobox", { name: /edge profile/i })
    await user.selectOptions(select, "Bullnose")
    expect((select as HTMLSelectElement).value).toBe("Bullnose")
  })
})

describe("IntakeScreen2Page — blur validation (onTouched mode)", () => {
  it("does not show countertop error before interaction", () => {
    renderScreen2()
    expect(screen.queryByText("Select a countertop material")).not.toBeInTheDocument()
  })

  it("shows countertop error after blurring without selection", async () => {
    const user = userEvent.setup()
    renderScreen2()
    const select = screen.getByRole("combobox", { name: /countertop material/i })
    await user.click(select)
    // Tab away to blur
    await user.tab()
    expect(await screen.findByText("Select a countertop material")).toBeInTheDocument()
  })

  it("does not show edge profile error before interaction", () => {
    renderScreen2()
    expect(screen.queryByText("Select an edge profile")).not.toBeInTheDocument()
  })

  it("shows edge profile error after blurring without selection", async () => {
    const user = userEvent.setup()
    renderScreen2()
    const select = screen.getByRole("combobox", { name: /edge profile/i })
    await user.click(select)
    await user.tab()
    expect(await screen.findByText("Select an edge profile")).toBeInTheDocument()
  })
})
