import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, waitFor } from "@testing-library/react"
import { PhotosForm } from "./PhotosForm"

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetQuotePhotos = vi.fn()

vi.mock("@/lib/supabase", () => ({
  getQuotePhotos: (...args: unknown[]) => mockGetQuotePhotos(...args),
  uploadQuotePhoto: vi.fn(),
  deleteQuotePhoto: vi.fn(),
}))

vi.mock("components", () => ({
  FileUpload: () => <div data-testid="file-upload" />,
}))

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PhotosForm", () => {
  beforeEach(() => {
    mockGetQuotePhotos.mockReset()
    mockGetQuotePhotos.mockResolvedValue([])
  })

  it("fetches photos once on initial render", async () => {
    render(<PhotosForm quoteId="q-1" publicToken="tok-abc" readOnly={false} />)
    await waitFor(() => expect(mockGetQuotePhotos).toHaveBeenCalledTimes(1))
    expect(mockGetQuotePhotos).toHaveBeenCalledWith("q-1", { publicToken: "tok-abc" })
  })

  it("does not re-fetch when re-rendered with the same quoteId and publicToken", async () => {
    const { rerender } = render(
      <PhotosForm quoteId="q-1" publicToken="tok-abc" readOnly={false} />
    )
    await waitFor(() => expect(mockGetQuotePhotos).toHaveBeenCalledTimes(1))

    // Simulate parent state update (e.g. after auto-save refreshes the quote object)
    rerender(<PhotosForm quoteId="q-1" publicToken="tok-abc" readOnly={false} />)

    // Allow any potential async effects to settle
    await new Promise((r) => setTimeout(r, 50))
    expect(mockGetQuotePhotos).toHaveBeenCalledTimes(1)
  })

  it("re-fetches when publicToken changes", async () => {
    const { rerender } = render(
      <PhotosForm quoteId="q-1" publicToken="tok-abc" readOnly={false} />
    )
    await waitFor(() => expect(mockGetQuotePhotos).toHaveBeenCalledTimes(1))

    rerender(<PhotosForm quoteId="q-1" publicToken="tok-xyz" readOnly={false} />)

    await waitFor(() => expect(mockGetQuotePhotos).toHaveBeenCalledTimes(2))
    expect(mockGetQuotePhotos).toHaveBeenLastCalledWith("q-1", { publicToken: "tok-xyz" })
  })

  it("re-fetches when quoteId changes", async () => {
    const { rerender } = render(
      <PhotosForm quoteId="q-1" publicToken="tok-abc" readOnly={false} />
    )
    await waitFor(() => expect(mockGetQuotePhotos).toHaveBeenCalledTimes(1))

    rerender(<PhotosForm quoteId="q-2" publicToken="tok-abc" readOnly={false} />)

    await waitFor(() => expect(mockGetQuotePhotos).toHaveBeenCalledTimes(2))
    expect(mockGetQuotePhotos).toHaveBeenLastCalledWith("q-2", { publicToken: "tok-abc" })
  })

  it("does not fetch when quoteId is null", async () => {
    render(<PhotosForm quoteId={null} publicToken="tok-abc" readOnly={false} />)
    await new Promise((r) => setTimeout(r, 50))
    expect(mockGetQuotePhotos).not.toHaveBeenCalled()
  })

  it("re-fetches when publicToken changes from defined to undefined", async () => {
    // This documents the behavior: if publicToken becomes undefined after being defined,
    // the effect re-fires. The fix in QuoteDetailPage ensures publicToken is never
    // lost from the quote state in save fallback paths.
    const { rerender } = render(
      <PhotosForm quoteId="q-1" publicToken="tok-abc" readOnly={false} />
    )
    await waitFor(() => expect(mockGetQuotePhotos).toHaveBeenCalledTimes(1))

    rerender(<PhotosForm quoteId="q-1" publicToken={undefined} readOnly={false} />)

    await waitFor(() => expect(mockGetQuotePhotos).toHaveBeenCalledTimes(2))
    expect(mockGetQuotePhotos).toHaveBeenLastCalledWith("q-1", { publicToken: undefined })
  })
})
