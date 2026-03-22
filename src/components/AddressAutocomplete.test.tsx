import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AddressAutocomplete } from "./AddressAutocomplete"
import type { AddressProvider, AddressSuggestion } from "@/lib/address/types"

// We need to control what getAddressProvider returns per test
let mockProvider: AddressProvider | null = null

vi.mock("@/lib/address/provider", () => ({
  getAddressProvider: () => mockProvider,
}))

// Helper: advance all timers (debounce is 300ms)
function advanceDebounce() {
  return act(() => {
    vi.advanceTimersByTime(300)
  })
}

describe("AddressAutocomplete — no provider", () => {
  beforeEach(() => {
    mockProvider = null
  })

  it("renders a plain input when no provider is configured", () => {
    render(<AddressAutocomplete value="" onChange={() => {}} />)
    const input = screen.getByRole("textbox")
    expect(input).toBeInTheDocument()
    // Plain input does not have combobox role
    expect(input).not.toHaveAttribute("role", "combobox")
  })
})

describe("AddressAutocomplete — trim dedup", () => {
  let suggestSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    suggestSpy = vi.fn().mockResolvedValue([
      { id: "1", label: "123 Main St" },
    ] satisfies AddressSuggestion[])
    mockProvider = {
      suggest: suggestSpy,
      resolve: vi.fn(),
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("calls suggest() when text is typed", async () => {
    const { rerender } = render(<AddressAutocomplete value="" onChange={() => {}} />)
    rerender(<AddressAutocomplete value="123 Main" onChange={() => {}} />)
    await advanceDebounce()
    expect(suggestSpy).toHaveBeenCalledTimes(1)
    expect(suggestSpy).toHaveBeenCalledWith("123 Main")
  })

  it("does not call suggest() again when only trailing whitespace is added", async () => {
    const { rerender } = render(<AddressAutocomplete value="" onChange={() => {}} />)

    // First render with a real value — triggers one call
    rerender(<AddressAutocomplete value="123 Main" onChange={() => {}} />)
    await advanceDebounce()
    expect(suggestSpy).toHaveBeenCalledTimes(1)

    // Adding trailing space — trimmed value is still "123 Main"
    rerender(<AddressAutocomplete value="123 Main " onChange={() => {}} />)
    await advanceDebounce()

    // suggest should still only have been called once
    expect(suggestSpy).toHaveBeenCalledTimes(1)
  })

  it("does call suggest() again when substantive text changes", async () => {
    const { rerender } = render(<AddressAutocomplete value="" onChange={() => {}} />)

    rerender(<AddressAutocomplete value="123 Main" onChange={() => {}} />)
    await advanceDebounce()
    expect(suggestSpy).toHaveBeenCalledTimes(1)

    rerender(<AddressAutocomplete value="123 Main St" onChange={() => {}} />)
    await advanceDebounce()
    expect(suggestSpy).toHaveBeenCalledTimes(2)
    expect(suggestSpy).toHaveBeenLastCalledWith("123 Main St")
  })
})
