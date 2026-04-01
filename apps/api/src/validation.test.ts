import { describe, it, expect } from "vitest"
import { quoteSubmissionSchema, quoteUpdateSchema, formatZodErrors, MAX_PAYLOAD_BYTES } from "./validation"

const validPayload = {
  contractorId: "00000000-0000-4000-8000-000000000001",
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "(555) 123-4567",
  jobSiteAddress: "123 Main St, Anytown, USA",
  propertyType: "house" as const,
  budgetRange: "10-25k" as const,
  schemaVersion: 1,
}

describe("quoteSubmissionSchema", () => {
  it("accepts a valid minimal payload", () => {
    const result = quoteSubmissionSchema.safeParse(validPayload)
    expect(result.success).toBe(true)
  })

  it("accepts a valid payload with optional fields", () => {
    const result = quoteSubmissionSchema.safeParse({
      ...validPayload,
      cell: "(555) 987-6543",
      howDidYouFindUs: "Google",
      referredByContractor: "Bob",
      scope: { cabinets: true, countertops: false },
    })
    expect(result.success).toBe(true)
  })

  it("accepts a valid payload with turnstileToken", () => {
    const result = quoteSubmissionSchema.safeParse({
      ...validPayload,
      turnstileToken: "0.fake-token-value",
    })
    expect(result.success).toBe(true)
  })

  it("accepts a valid payload without turnstileToken (optional)", () => {
    const result = quoteSubmissionSchema.safeParse(validPayload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.turnstileToken).toBeUndefined()
    }
  })

  it("rejects turnstileToken over 2048 characters", () => {
    const result = quoteSubmissionSchema.safeParse({
      ...validPayload,
      turnstileToken: "x".repeat(2049),
    })
    expect(result.success).toBe(false)
  })

  it("rejects missing required fields", () => {
    const result = quoteSubmissionSchema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = formatZodErrors(result.error)
      expect(fields.name).toBeDefined()
      expect(fields.email).toBeDefined()
      expect(fields.phone).toBeDefined()
      expect(fields.jobSiteAddress).toBeDefined()
      expect(fields.schemaVersion).toBeDefined()
    }
  })

  it("rejects invalid email", () => {
    const result = quoteSubmissionSchema.safeParse({
      ...validPayload,
      email: "not-an-email",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = formatZodErrors(result.error)
      expect(fields.email).toBe("Enter a valid email address")
    }
  })

  it("rejects phone with fewer than 10 digits", () => {
    const result = quoteSubmissionSchema.safeParse({
      ...validPayload,
      phone: "555-1234",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = formatZodErrors(result.error)
      expect(fields.phone).toContain("at least 10 digits")
    }
  })

  it("rejects invalid propertyType", () => {
    const result = quoteSubmissionSchema.safeParse({
      ...validPayload,
      propertyType: "castle",
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid budgetRange", () => {
    const result = quoteSubmissionSchema.safeParse({
      ...validPayload,
      budgetRange: "1million",
    })
    expect(result.success).toBe(false)
  })

  it("rejects non-integer schemaVersion", () => {
    const result = quoteSubmissionSchema.safeParse({
      ...validPayload,
      schemaVersion: 1.5,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = formatZodErrors(result.error)
      expect(fields.schemaVersion).toContain("whole number")
    }
  })

  it("rejects name over 200 characters", () => {
    const result = quoteSubmissionSchema.safeParse({
      ...validPayload,
      name: "A".repeat(201),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = formatZodErrors(result.error)
      expect(fields.name).toContain("200 characters")
    }
  })

  it("rejects jobSiteAddress over 500 characters", () => {
    const result = quoteSubmissionSchema.safeParse({
      ...validPayload,
      jobSiteAddress: "A".repeat(501),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = formatZodErrors(result.error)
      expect(fields.jobSiteAddress).toContain("500 characters")
    }
  })

  it("strips HTML tags from string fields", () => {
    const result = quoteSubmissionSchema.safeParse({
      ...validPayload,
      name: '<script>alert("xss")</script>Jane Doe',
      jobSiteAddress: '<img src=x onerror="alert(1)">123 Main St',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('alert("xss")Jane Doe')
      expect(result.data.jobSiteAddress).toBe('123 Main St')
    }
  })

  it("rejects scope over 10KB", () => {
    const largeScope: Record<string, string> = {}
    // Create scope that exceeds 10KB when stringified
    for (let i = 0; i < 200; i++) {
      largeScope[`field_${i}`] = "x".repeat(100)
    }
    const result = quoteSubmissionSchema.safeParse({
      ...validPayload,
      scope: largeScope,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = formatZodErrors(result.error)
      expect(fields.scope).toContain("10KB")
    }
  })
})

describe("quoteUpdateSchema", () => {
  it("accepts a single editable field", () => {
    const result = quoteUpdateSchema.safeParse({ name: "Updated Name" })
    expect(result.success).toBe(true)
  })

  it("accepts multiple editable fields", () => {
    const result = quoteUpdateSchema.safeParse({
      name: "Updated Name",
      email: "new@example.com",
      phone: "(555) 999-8888",
      jobSiteAddress: "456 Oak Ave",
      propertyType: "apt",
      budgetRange: "25-50k",
    })
    expect(result.success).toBe(true)
  })

  it("rejects an empty object", () => {
    const result = quoteUpdateSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it("rejects invalid email", () => {
    const result = quoteUpdateSchema.safeParse({ email: "not-an-email" })
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = formatZodErrors(result.error)
      expect(fields.email).toBe("Enter a valid email address")
    }
  })

  it("rejects invalid phone", () => {
    const result = quoteUpdateSchema.safeParse({ phone: "123" })
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = formatZodErrors(result.error)
      expect(fields.phone).toContain("at least 10 digits")
    }
  })

  it("rejects invalid propertyType", () => {
    const result = quoteUpdateSchema.safeParse({ propertyType: "castle" })
    expect(result.success).toBe(false)
  })

  it("rejects invalid budgetRange", () => {
    const result = quoteUpdateSchema.safeParse({ budgetRange: "1million" })
    expect(result.success).toBe(false)
  })

  it("rejects name over 200 characters", () => {
    const result = quoteUpdateSchema.safeParse({ name: "A".repeat(201) })
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = formatZodErrors(result.error)
      expect(fields.name).toContain("200 characters")
    }
  })

  it("strips HTML tags from string fields", () => {
    const result = quoteUpdateSchema.safeParse({
      name: '<script>alert("xss")</script>Jane',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('alert("xss")Jane')
    }
  })

  it("rejects scope over 10KB", () => {
    const largeScope: Record<string, string> = {}
    for (let i = 0; i < 200; i++) {
      largeScope[`field_${i}`] = "x".repeat(100)
    }
    const result = quoteUpdateSchema.safeParse({ scope: largeScope })
    expect(result.success).toBe(false)
  })

  it("accepts scope update", () => {
    const result = quoteUpdateSchema.safeParse({
      scope: { cabinets: true, flooring: "hardwood" },
    })
    expect(result.success).toBe(true)
  })

  it("ignores unknown fields", () => {
    const result = quoteUpdateSchema.safeParse({
      name: "Test",
      id: "should-be-ignored",
      contractorId: "should-be-ignored",
      status: "should-be-ignored",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).not.toHaveProperty("id")
      expect(result.data).not.toHaveProperty("contractorId")
      expect(result.data).not.toHaveProperty("status")
    }
  })
})

describe("MAX_PAYLOAD_BYTES", () => {
  it("is 100KB", () => {
    expect(MAX_PAYLOAD_BYTES).toBe(100 * 1024)
  })
})
