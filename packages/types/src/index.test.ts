import { describe, it, expect } from "vitest"
import {
  QuoteStatusEnum,
  QuoteSchema,
  CustomerSchema,
  AppointmentWindowSchema,
  PhotoUploadSchema,
} from "./index"

describe("QuoteStatusEnum", () => {
  it("accepts all valid statuses", () => {
    const statuses = [
      "draft", "lead", "reviewing", "site_visit_requested", "site_visit_scheduled",
      "site_visit_completed", "estimate_requested", "estimate_sent",
      "accepted", "rejected", "closed",
    ]
    for (const s of statuses) {
      expect(QuoteStatusEnum.parse(s)).toBe(s)
    }
  })

  it("rejects unknown status", () => {
    expect(() => QuoteStatusEnum.parse("unknown")).toThrow()
  })
})

describe("QuoteSchema", () => {
  const minimal = {
    id: "q-1",
    createdAt: "2026-01-01T00:00:00Z",
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "555-1234",
    howDidYouFindUs: "google",
    status: "lead" as const,
    statusHistory: [],
    contractorNotes: "",
  }

  it("parses a minimal valid quote", () => {
    const result = QuoteSchema.parse(minimal)
    expect(result.id).toBe("q-1")
    expect(result.status).toBe("lead")
  })

  it("parses optional fields when present", () => {
    const result = QuoteSchema.parse({
      ...minimal,
      cell: "555-5678",
      jobSiteAddress: "123 Main St",
      propertyType: "house",
      budgetRange: "25-50k",
      scope: { painting: true },
      photoSessionId: "sess-abc",
    })
    expect(result.propertyType).toBe("house")
    expect(result.budgetRange).toBe("25-50k")
  })

  it("rejects invalid email", () => {
    expect(() => QuoteSchema.parse({ ...minimal, email: "not-an-email" })).toThrow()
  })

  it("rejects invalid status", () => {
    expect(() => QuoteSchema.parse({ ...minimal, status: "bogus" })).toThrow()
  })

  it("parses statusHistory entries", () => {
    const result = QuoteSchema.parse({
      ...minimal,
      statusHistory: [{ status: "lead", timestamp: "2026-01-01T00:00:00Z" }],
    })
    expect(result.statusHistory).toHaveLength(1)
    expect(result.statusHistory[0].status).toBe("lead")
  })
})

describe("CustomerSchema", () => {
  const minimal = {
    id: "c-1",
    name: "Bob Smith",
    email: "bob@example.com",
    phone: "555-9999",
    createdAt: "2026-01-01T00:00:00Z",
  }

  it("parses a minimal valid customer", () => {
    const result = CustomerSchema.parse(minimal)
    expect(result.id).toBe("c-1")
  })

  it("accepts optional fields", () => {
    const result = CustomerSchema.parse({
      ...minimal,
      cell: "555-0000",
      howDidYouFindUs: "referral",
      referredByContractor: "contractor-x",
    })
    expect(result.cell).toBe("555-0000")
  })

  it("rejects invalid email", () => {
    expect(() => CustomerSchema.parse({ ...minimal, email: "bad" })).toThrow()
  })
})

describe("AppointmentWindowSchema", () => {
  it("parses a valid window", () => {
    const result = AppointmentWindowSchema.parse({
      id: "w-1",
      label: "Morning",
      startAt: "2026-06-01T09:00:00Z",
      endAt: "2026-06-01T12:00:00Z",
    })
    expect(result.label).toBe("Morning")
  })

  it("rejects missing fields", () => {
    expect(() => AppointmentWindowSchema.parse({ id: "w-1" })).toThrow()
  })
})

describe("PhotoUploadSchema", () => {
  it("parses a valid photo upload", () => {
    const result = PhotoUploadSchema.parse({
      id: "p-1",
      filename: "photo.jpg",
      contentType: "image/jpeg",
      size: 1024,
      url: "https://example.com/photo.jpg",
    })
    expect(result.filename).toBe("photo.jpg")
  })

  it("rejects negative size", () => {
    expect(() =>
      PhotoUploadSchema.parse({
        id: "p-1",
        filename: "photo.jpg",
        contentType: "image/jpeg",
        size: -1,
        url: "https://example.com/photo.jpg",
      })
    ).toThrow()
  })

  it("rejects non-integer size", () => {
    expect(() =>
      PhotoUploadSchema.parse({
        id: "p-1",
        filename: "photo.jpg",
        contentType: "image/jpeg",
        size: 1.5,
        url: "https://example.com/photo.jpg",
      })
    ).toThrow()
  })
})
