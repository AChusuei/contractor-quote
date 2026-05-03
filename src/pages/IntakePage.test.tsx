import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import type * as ReactRouterDom from "react-router-dom"
import type * as UseContractorModule from "@/hooks/useContractor"
import { IntakePage } from "./IntakePage"
import type { ContractorPublicInfo } from "@/hooks/useContractor"

const mockNavigate = vi.fn()
vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof ReactRouterDom>()
  return {
    ...mod,
    useNavigate: () => mockNavigate,
  }
})

// Mock Turnstile — no site key configured in test env, so widget is null
vi.mock("@/components/Turnstile", () => ({
  useTurnstile: () => ({
    getToken: () => null,
    resetToken: () => {},
    TurnstileWidget: null,
  }),
}))

const { mockUseContractor } = vi.hoisted(() => ({ mockUseContractor: vi.fn() }))
vi.mock("@/hooks/useContractor", async (importOriginal) => {
  const mod = await importOriginal<typeof UseContractorModule>()
  return { ...mod, useContractor: mockUseContractor }
})

const testContractor: ContractorPublicInfo = {
  id: "c1",
  slug: "test-co",
  name: "Test Co",
  logoUrl: null,
  calendarUrl: null,
  phone: null,
}

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

  await user.selectOptions(screen.getByLabelText(/how did you find us/i), "google")
}

describe("IntakePage — phone validation", () => {
  let user: ReturnType<typeof userEvent.setup>
  beforeEach(() => {
    user = userEvent.setup()
    mockNavigate.mockReset()
    mockUseContractor.mockReturnValue({ contractor: testContractor, loading: false, error: null })
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
})

describe("IntakePage — navigation on submit", () => {
  let user: ReturnType<typeof userEvent.setup>
  beforeEach(() => {
    user = userEvent.setup()
    mockNavigate.mockReset()
    mockUseContractor.mockReturnValue({ contractor: testContractor, loading: false, error: null })
  })

  it("navigates to /intake/scope when all required fields are valid", async () => {
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
    mockUseContractor.mockReturnValue({ contractor: testContractor, loading: false, error: null })
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

describe("IntakePage — no contractor guard", () => {
  let user: ReturnType<typeof userEvent.setup>
  beforeEach(() => {
    user = userEvent.setup()
    mockNavigate.mockReset()
  })

  it("disables form fields when contractor is null and not loading", () => {
    mockUseContractor.mockReturnValue({ contractor: null, loading: false, error: null })
    renderIntakePage()
    expect(screen.getByLabelText(/full name/i)).toBeDisabled()
    expect(screen.getByLabelText(/email \*/i)).toBeDisabled()
    expect(screen.getByLabelText(/phone \*/i)).toBeDisabled()
    expect(screen.getByLabelText(/how did you find us/i)).toBeDisabled()
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled()
  })

  it("shows a message when no contractor is configured", () => {
    mockUseContractor.mockReturnValue({ contractor: null, loading: false, error: null })
    renderIntakePage()
    expect(screen.getByText(/no contractor configured/i)).toBeInTheDocument()
  })

  it("enables form fields when contractor is loaded", () => {
    mockUseContractor.mockReturnValue({ contractor: testContractor, loading: false, error: null })
    renderIntakePage()
    expect(screen.getByLabelText(/full name/i)).not.toBeDisabled()
    expect(screen.getByLabelText(/email \*/i)).not.toBeDisabled()
    expect(screen.getByLabelText(/phone \*/i)).not.toBeDisabled()
    expect(screen.getByRole("button", { name: /continue/i })).not.toBeDisabled()
  })

  it("does not disable form during loading (contractor may still resolve)", () => {
    mockUseContractor.mockReturnValue({ contractor: null, loading: true, error: null })
    renderIntakePage()
    expect(screen.getByLabelText(/full name/i)).not.toBeDisabled()
    expect(screen.getByRole("button", { name: /continue/i })).not.toBeDisabled()
  })

  it("does not navigate when contractor is missing and all fields are filled", async () => {
    mockUseContractor.mockReturnValue({ contractor: null, loading: false, error: null })
    renderIntakePage()
    // Form is disabled so clicking submit should not navigate
    const submitBtn = screen.getByRole("button", { name: /continue/i })
    expect(submitBtn).toBeDisabled()
    await user.click(submitBtn)
    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalled()
    })
  })
})
