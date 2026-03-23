import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { IntakePage } from "./IntakePage"

const mockNavigate = vi.fn()
vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>()
  return {
    ...mod,
    useNavigate: () => mockNavigate,
  }
})

// Render AddressAutocomplete as plain input (no provider)
vi.mock("@/lib/address/provider", () => ({
  getAddressProvider: () => null,
}))

// Mock Turnstile — no site key configured in test env, so widget is null
vi.mock("@/components/Turnstile", () => ({
  useTurnstile: () => ({
    getToken: () => null,
    resetToken: () => {},
    TurnstileWidget: null,
  }),
}))

function renderIntakePage() {
  return render(
    <MemoryRouter>
      <IntakePage />
    </MemoryRouter>
  )
}

// Fill all required fields so submit can succeed
async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/full name/i), "Jane Smith")
  fireEvent.blur(screen.getByLabelText(/full name/i))

  await user.type(screen.getByLabelText(/email \*/i), "jane@example.com")
  fireEvent.blur(screen.getByLabelText(/email \*/i))

  await user.type(screen.getByLabelText(/phone \*/i), "5551234567")
  fireEvent.blur(screen.getByLabelText(/phone \*/i))

  await user.type(screen.getByLabelText(/job site address/i), "123 Main St")
  fireEvent.blur(screen.getByLabelText(/job site address/i))

  await user.selectOptions(screen.getByLabelText(/property type/i), "house")
  await user.selectOptions(screen.getByLabelText(/budget range/i), "<10k")
  await user.selectOptions(screen.getByLabelText(/how did you find us/i), "google")
}

describe("IntakePage — phone validation", () => {
  let user: ReturnType<typeof userEvent.setup>
  beforeEach(() => {
    user = userEvent.setup()
    mockNavigate.mockReset()
  })

  it("rejects phone numbers with fewer than 10 digits", async () => {
    renderIntakePage()
    const phone = screen.getByLabelText(/phone \*/i)
    await user.type(phone, "12345")
    fireEvent.blur(phone)
    expect(await screen.findByText("Enter a valid phone number")).toBeInTheDocument()
  })

  it("accepts phone with exactly 10 digits after stripping non-numeric chars", async () => {
    renderIntakePage()
    const phone = screen.getByLabelText(/phone \*/i)
    await user.type(phone, "(555) 123-4567")
    fireEvent.blur(phone)
    await waitFor(() => {
      expect(screen.queryByText("Enter a valid phone number")).not.toBeInTheDocument()
    })
  })

  it("accepts cell when empty (optional field)", async () => {
    renderIntakePage()
    const cell = screen.getByLabelText(/^cell$/i)
    fireEvent.click(cell)
    fireEvent.blur(cell)
    await waitFor(() => {
      expect(screen.queryByText("Enter a valid phone number")).not.toBeInTheDocument()
    })
  })

  it("rejects cell with fewer than 10 digits", async () => {
    renderIntakePage()
    const cell = screen.getByLabelText(/^cell$/i)
    await user.type(cell, "555")
    fireEvent.blur(cell)
    expect(await screen.findByText("Enter a valid phone number")).toBeInTheDocument()
  })

  it("accepts cell with a valid 10-digit number", async () => {
    renderIntakePage()
    const cell = screen.getByLabelText(/^cell$/i)
    await user.type(cell, "555-987-6543")
    fireEvent.blur(cell)
    await waitFor(() => {
      expect(screen.queryByText("Enter a valid phone number")).not.toBeInTheDocument()
    })
  })
})

describe("IntakePage — navigation on submit", () => {
  let user: ReturnType<typeof userEvent.setup>
  beforeEach(() => {
    user = userEvent.setup()
    mockNavigate.mockReset()
  })

  it("navigates to /intake/scope when all required fields are valid", async () => {
    // HubSpot portal/form IDs are not configured in test env, so submitToHubSpot
    // skips the network call and returns cleanly — navigate() runs immediately.
    renderIntakePage()
    await fillRequiredFields(user)

    await user.click(screen.getByRole("button", { name: /continue/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/intake/scope")
    })
  })

  it("does not navigate when required fields are missing", async () => {
    renderIntakePage()
    // Submit without filling any fields — validation should block navigation
    await user.click(screen.getByRole("button", { name: /continue/i }))

    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalled()
    })
    // Validation errors should be visible
    expect(screen.getByText("Name is required")).toBeInTheDocument()
  })
})

describe("IntakePage — blur validation (onTouched mode)", () => {
  let user: ReturnType<typeof userEvent.setup>
  beforeEach(() => {
    user = userEvent.setup()
  })

  it("does not show name error before the field is touched", () => {
    renderIntakePage()
    expect(screen.queryByText("Name is required")).not.toBeInTheDocument()
  })

  it("shows name error after field is blurred empty", async () => {
    renderIntakePage()
    const name = screen.getByLabelText(/full name/i)
    fireEvent.click(name)
    fireEvent.blur(name)
    expect(await screen.findByText("Name is required")).toBeInTheDocument()
  })

  it("shows email error after blurring with invalid email", async () => {
    renderIntakePage()
    const email = screen.getByLabelText(/email \*/i)
    await user.type(email, "not-an-email")
    fireEvent.blur(email)
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument()
  })

  it("does not show email error before the field is touched", () => {
    renderIntakePage()
    expect(screen.queryByText("Enter a valid email")).not.toBeInTheDocument()
  })
})
