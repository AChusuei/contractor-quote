import { describe, it, expect, vi, beforeEach } from "vitest"
import { sendNewQuoteNotification } from "./lib/email"

const baseParams = {
  contractorEmail: "admin@example.com",
  contractorName: "Central Cabinets",
  customerName: "Jane Doe",
  jobSiteAddress: "123 Main St",
  budgetRange: "10-25k",
  quoteId: "quote-abc-123",
}

describe("sendNewQuoteNotification", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("logs to console when no SendGrid API key is provided", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    await sendNewQuoteNotification(baseParams, undefined)

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("dev mode")
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("admin@example.com")
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Jane Doe")
    )
  })

  it("logs to console when SendGrid API key is empty string", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    await sendNewQuoteNotification(baseParams, "")

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("dev mode")
    )
  })

  it("calls SendGrid API when API key is provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 202 })
    )

    await sendNewQuoteNotification(baseParams, "SG.test-key")

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe("https://api.sendgrid.com/v3/mail/send")
    expect(init?.method).toBe("POST")
    expect(init?.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer SG.test-key",
      })
    )

    const body = JSON.parse(init?.body as string)
    expect(body.personalizations[0].to[0].email).toBe("admin@example.com")
    expect(body.subject).toContain("Jane Doe")
    expect(body.content[0].value).toContain("123 Main St")
    expect(body.content[0].value).toContain("10-25k")
    expect(body.content[0].value).toContain("quote-abc-123")
  })

  it("logs error when SendGrid API returns non-ok status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Forbidden", { status: 403 })
    )
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    await sendNewQuoteNotification(baseParams, "SG.bad-key")

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("SendGrid API error (403)")
    )
  })
})
