import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { IntakePhotosPage } from "../IntakePhotosPage"
import type { UploadFile } from "components"

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock("@/lib/supabase", () => ({
  uploadQuotePhoto: vi.fn().mockResolvedValue("session/file.jpg"),
}))

// Capture the onChange prop so tests can fire file drops
let capturedOnChange: ((files: UploadFile[]) => void) | undefined

vi.mock("components", async (importOriginal) => {
  const actual = await importOriginal<typeof import("components")>()
  return {
    ...actual,
    FileUpload: (props: {
      onChange?: (files: UploadFile[]) => void
      disabled?: boolean
      onUpload?: unknown
    }) => {
      capturedOnChange = props.onChange
      return (
        <div data-testid="file-upload" data-disabled={props.disabled ?? false}>
          <button
            data-testid="drop-trigger"
            onClick={() =>
              props.onChange?.([
                {
                  id: "f1",
                  file: new File(["x"], "photo.jpg", { type: "image/jpeg" }),
                  progress: 0,
                  status: "idle",
                },
              ])
            }
          >
            drop
          </button>
        </div>
      )
    },
  }
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/intake/photos"]}>
      <Routes>
        <Route path="/intake/photos" element={<IntakePhotosPage />} />
        <Route path="/intake/confirmation" element={<div>Review page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

function makeFile(status: UploadFile["status"] = "idle"): UploadFile {
  return {
    id: `f-${Math.random()}`,
    file: new File(["x"], "photo.jpg", { type: "image/jpeg" }),
    progress: 0,
    status,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("IntakePhotosPage", () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    capturedOnChange = undefined
  })

  it("renders the dropzone and skip button when no files are present", () => {
    renderPage()
    expect(screen.getByTestId("file-upload")).toBeTruthy()
    expect(screen.getByRole("button", { name: /skip/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /continue/i })).toBeTruthy()
  })

  it("hides skip button once files are added", async () => {
    renderPage()
    expect(screen.getByRole("button", { name: /skip/i })).toBeTruthy()

    fireEvent.click(screen.getByTestId("drop-trigger"))

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /skip/i })).toBeNull()
    )
  })

  it("disables continue button while a file is uploading", async () => {
    renderPage()

    // Simulate an uploading entry via onChange
    capturedOnChange?.([makeFile("uploading")])

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /uploading/i })
      expect(btn).toBeDisabled()
    })
  })

  it("navigates to /intake/review when Continue is clicked", async () => {
    renderPage()
    fireEvent.click(screen.getByRole("button", { name: /continue/i }))
    expect(mockNavigate).toHaveBeenCalledWith("/intake/confirmation")
  })

  it("navigates to /intake/review when Skip is clicked", () => {
    renderPage()
    fireEvent.click(screen.getByRole("button", { name: /skip/i }))
    expect(mockNavigate).toHaveBeenCalledWith("/intake/confirmation")
  })

  it("disables the dropzone when at the 10-photo limit", async () => {
    renderPage()

    const tenFiles = Array.from({ length: 10 }, () => makeFile("success"))
    capturedOnChange?.(tenFiles)

    await waitFor(() => {
      expect(screen.getByTestId("file-upload").getAttribute("data-disabled")).toBe("true")
    })
  })

  it("shows an error message when any file has error status", async () => {
    renderPage()
    capturedOnChange?.([makeFile("error")])

    await waitFor(() => {
      expect(screen.getByText(/failed to upload/i)).toBeTruthy()
    })
  })
})
