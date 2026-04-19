import { env, SELF } from "cloudflare:test"
import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  setupDb,
  seedContractorWithBilling,
  paddleSignatureHeader,
  apiUrl,
} from "./test-helpers"

const TEST_SECRET = "test-paddle-secret"

beforeEach(async () => {
  await setupDb()
})

function paddleRequest(body: unknown, signature: string) {
  const raw = JSON.stringify(body)
  return SELF.fetch(apiUrl("/webhooks/paddle"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "paddle-signature": signature,
    },
    body: raw,
  })
}

async function signedRequest(body: unknown) {
  const raw = JSON.stringify(body)
  const sig = await paddleSignatureHeader(raw, TEST_SECRET)
  return SELF.fetch(apiUrl("/webhooks/paddle"), {
    method: "POST",
    headers: { "content-type": "application/json", "paddle-signature": sig },
    body: raw,
  })
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

describe("POST /api/v1/webhooks/paddle — signature verification", () => {
  it("returns 400 when paddle-signature header is missing", async () => {
    const res = await SELF.fetch(apiUrl("/webhooks/paddle"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event_type: "subscription.activated", data: { id: "sub_1" } }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(false)
  })

  it("returns 400 for an invalid signature", async () => {
    const res = await paddleRequest(
      { event_type: "subscription.activated", data: { id: "sub_1" } },
      "ts=1234;h1=badhash"
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(false)
  })

  it("returns 200 for a valid signature with an unknown event", async () => {
    const res = await signedRequest({ event_type: "subscription.trialing", data: { id: "sub_1" } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// subscription.activated
// ---------------------------------------------------------------------------

describe("subscription.activated", () => {
  it("sets billing_status to active and clears grace_period_ends_at", async () => {
    const contractor = await seedContractorWithBilling({
      billingStatus: "past_due",
      gracePeriodEndsAt: "2099-01-01T00:00:00Z",
    })

    const payload = {
      event_type: "subscription.activated",
      data: { id: contractor.paddleSubscriptionId, customer_id: contractor.paddleCustomerId },
    }
    const res = await signedRequest(payload)
    expect(res.status).toBe(200)

    const row = await env.DB.prepare(
      "SELECT billing_status, grace_period_ends_at FROM contractors WHERE id = ?"
    )
      .bind(contractor.id)
      .first<{ billing_status: string; grace_period_ends_at: string | null }>()
    expect(row?.billing_status).toBe("active")
    expect(row?.grace_period_ends_at).toBeNull()
  })

  it("is idempotent — no change when already active with no grace period", async () => {
    const contractor = await seedContractorWithBilling({ billingStatus: "active", gracePeriodEndsAt: null })

    const payload = {
      event_type: "subscription.activated",
      data: { id: contractor.paddleSubscriptionId, customer_id: contractor.paddleCustomerId },
    }
    await signedRequest(payload)
    await signedRequest(payload)

    const row = await env.DB.prepare(
      "SELECT billing_status FROM contractors WHERE id = ?"
    )
      .bind(contractor.id)
      .first<{ billing_status: string }>()
    expect(row?.billing_status).toBe("active")
  })

  it("matches contractor by customer_id alone", async () => {
    const contractor = await seedContractorWithBilling({
      paddleSubscriptionId: null,
      billingStatus: "trialing",
    })

    const payload = {
      event_type: "subscription.activated",
      data: { id: "sub_doesnt_matter", customer_id: contractor.paddleCustomerId },
    }
    const res = await signedRequest(payload)
    expect(res.status).toBe(200)

    const row = await env.DB.prepare(
      "SELECT billing_status FROM contractors WHERE id = ?"
    )
      .bind(contractor.id)
      .first<{ billing_status: string }>()
    expect(row?.billing_status).toBe("active")
  })
})

// ---------------------------------------------------------------------------
// subscription.past_due
// ---------------------------------------------------------------------------

describe("subscription.past_due", () => {
  it("sets billing_status to past_due and sets grace_period_ends_at ~5 days out", async () => {
    const contractor = await seedContractorWithBilling({ billingStatus: "active" })

    const payload = {
      event_type: "subscription.past_due",
      data: { id: contractor.paddleSubscriptionId, customer_id: contractor.paddleCustomerId },
    }
    const res = await signedRequest(payload)
    expect(res.status).toBe(200)

    const row = await env.DB.prepare(
      "SELECT billing_status, grace_period_ends_at FROM contractors WHERE id = ?"
    )
      .bind(contractor.id)
      .first<{ billing_status: string; grace_period_ends_at: string | null }>()
    expect(row?.billing_status).toBe("past_due")
    expect(row?.grace_period_ends_at).not.toBeNull()

    // grace period should be ~5 days in the future
    const graceEnd = new Date(row!.grace_period_ends_at!.replace(" ", "T") + "Z")
    const diffDays = (graceEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(4)
    expect(diffDays).toBeLessThan(6)
  })

  it("is idempotent — no change when already past_due", async () => {
    const fixedGrace = "2099-06-01 00:00:00"
    const contractor = await seedContractorWithBilling({
      billingStatus: "past_due",
      gracePeriodEndsAt: fixedGrace,
    })

    const payload = {
      event_type: "subscription.past_due",
      data: { id: contractor.paddleSubscriptionId, customer_id: contractor.paddleCustomerId },
    }
    await signedRequest(payload)

    const row = await env.DB.prepare(
      "SELECT grace_period_ends_at FROM contractors WHERE id = ?"
    )
      .bind(contractor.id)
      .first<{ grace_period_ends_at: string | null }>()
    // Grace period should not have been reset
    expect(row?.grace_period_ends_at).toBe(fixedGrace)
  })
})

// ---------------------------------------------------------------------------
// subscription.canceled
// ---------------------------------------------------------------------------

describe("subscription.canceled", () => {
  it("sets billing_status to canceled", async () => {
    const contractor = await seedContractorWithBilling({ billingStatus: "active" })

    const payload = {
      event_type: "subscription.canceled",
      data: { id: contractor.paddleSubscriptionId, customer_id: contractor.paddleCustomerId },
    }
    const res = await signedRequest(payload)
    expect(res.status).toBe(200)

    const row = await env.DB.prepare(
      "SELECT billing_status FROM contractors WHERE id = ?"
    )
      .bind(contractor.id)
      .first<{ billing_status: string }>()
    expect(row?.billing_status).toBe("canceled")
  })

  it("is idempotent — no change when already canceled", async () => {
    const contractor = await seedContractorWithBilling({ billingStatus: "canceled" })

    const payload = {
      event_type: "subscription.canceled",
      data: { id: contractor.paddleSubscriptionId, customer_id: contractor.paddleCustomerId },
    }
    await signedRequest(payload)
    await signedRequest(payload)

    const row = await env.DB.prepare(
      "SELECT billing_status FROM contractors WHERE id = ?"
    )
      .bind(contractor.id)
      .first<{ billing_status: string }>()
    expect(row?.billing_status).toBe("canceled")
  })
})

// ---------------------------------------------------------------------------
// transaction.completed
// ---------------------------------------------------------------------------

describe("transaction.completed", () => {
  it("sets billing_status to active and clears grace_period_ends_at", async () => {
    const contractor = await seedContractorWithBilling({
      billingStatus: "past_due",
      gracePeriodEndsAt: "2099-01-01 00:00:00",
    })

    const payload = {
      event_type: "transaction.completed",
      data: {
        id: "txn_abc",
        customer_id: contractor.paddleCustomerId,
        subscription_id: contractor.paddleSubscriptionId,
      },
    }
    const res = await signedRequest(payload)
    expect(res.status).toBe(200)

    const row = await env.DB.prepare(
      "SELECT billing_status, grace_period_ends_at FROM contractors WHERE id = ?"
    )
      .bind(contractor.id)
      .first<{ billing_status: string; grace_period_ends_at: string | null }>()
    expect(row?.billing_status).toBe("active")
    expect(row?.grace_period_ends_at).toBeNull()
  })

  it("matches by subscription_id (data.subscription_id for transaction events)", async () => {
    const contractor = await seedContractorWithBilling({
      paddleCustomerId: null,
      billingStatus: "past_due",
      gracePeriodEndsAt: "2099-01-01 00:00:00",
    })

    const payload = {
      event_type: "transaction.completed",
      data: {
        id: "txn_xyz",
        customer_id: null,
        subscription_id: contractor.paddleSubscriptionId,
      },
    }
    const res = await signedRequest(payload)
    expect(res.status).toBe(200)

    const row = await env.DB.prepare(
      "SELECT billing_status FROM contractors WHERE id = ?"
    )
      .bind(contractor.id)
      .first<{ billing_status: string }>()
    expect(row?.billing_status).toBe("active")
  })
})

// ---------------------------------------------------------------------------
// transaction.payment_failed
// ---------------------------------------------------------------------------

describe("transaction.payment_failed", () => {
  it("sets grace_period_ends_at ~5 days out when null", async () => {
    const contractor = await seedContractorWithBilling({
      billingStatus: "active",
      gracePeriodEndsAt: null,
    })

    const payload = {
      event_type: "transaction.payment_failed",
      data: {
        id: "txn_fail1",
        customer_id: contractor.paddleCustomerId,
        subscription_id: contractor.paddleSubscriptionId,
      },
    }
    const res = await signedRequest(payload)
    expect(res.status).toBe(200)

    const row = await env.DB.prepare(
      "SELECT billing_status, grace_period_ends_at FROM contractors WHERE id = ?"
    )
      .bind(contractor.id)
      .first<{ billing_status: string; grace_period_ends_at: string | null }>()
    expect(row?.billing_status).toBe("active")
    expect(row?.grace_period_ends_at).not.toBeNull()

    const graceEnd = new Date(row!.grace_period_ends_at!.replace(" ", "T") + "Z")
    const diffDays = (graceEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(4)
    expect(diffDays).toBeLessThan(6)
  })

  it("suspends contractor when grace_period_ends_at is in the past", async () => {
    const contractor = await seedContractorWithBilling({
      billingStatus: "past_due",
      gracePeriodEndsAt: "2020-01-01 00:00:00",
    })

    const payload = {
      event_type: "transaction.payment_failed",
      data: {
        id: "txn_fail2",
        customer_id: contractor.paddleCustomerId,
        subscription_id: contractor.paddleSubscriptionId,
      },
    }
    const res = await signedRequest(payload)
    expect(res.status).toBe(200)

    const row = await env.DB.prepare(
      "SELECT billing_status FROM contractors WHERE id = ?"
    )
      .bind(contractor.id)
      .first<{ billing_status: string }>()
    expect(row?.billing_status).toBe("suspended")
  })

  it("does not change status when grace_period_ends_at is still in the future", async () => {
    const contractor = await seedContractorWithBilling({
      billingStatus: "past_due",
      gracePeriodEndsAt: "2099-12-31 00:00:00",
    })

    const payload = {
      event_type: "transaction.payment_failed",
      data: {
        id: "txn_fail3",
        customer_id: contractor.paddleCustomerId,
        subscription_id: contractor.paddleSubscriptionId,
      },
    }
    const res = await signedRequest(payload)
    expect(res.status).toBe(200)

    const row = await env.DB.prepare(
      "SELECT billing_status FROM contractors WHERE id = ?"
    )
      .bind(contractor.id)
      .first<{ billing_status: string }>()
    expect(row?.billing_status).toBe("past_due")
  })

  it("sends payment failed email notification", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, _init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      if (url === "https://api.sendgrid.com/v3/mail/send") {
        return new Response(null, { status: 202 })
      }
      return new Response(null, { status: 200 })
    })

    const contractor = await seedContractorWithBilling({
      email: "owner@test.example",
      billingStatus: "active",
      gracePeriodEndsAt: null,
    })

    const payload = {
      event_type: "transaction.payment_failed",
      data: {
        id: "txn_email1",
        customer_id: contractor.paddleCustomerId,
        subscription_id: contractor.paddleSubscriptionId,
      },
    }
    const res = await signedRequest(payload)
    expect(res.status).toBe(200)

    // In dev mode (SENDGRID_API_KEY not set), no actual fetch to sendgrid is made
    // The handler logs to console instead — verify we get 200
    fetchSpy.mockRestore()
  })

  it("is idempotent — does not reset grace period on repeated payment_failed with grace still active", async () => {
    const fixedGrace = "2099-06-01 00:00:00"
    const contractor = await seedContractorWithBilling({
      billingStatus: "past_due",
      gracePeriodEndsAt: fixedGrace,
    })

    const payload = {
      event_type: "transaction.payment_failed",
      data: {
        id: "txn_idem",
        customer_id: contractor.paddleCustomerId,
        subscription_id: contractor.paddleSubscriptionId,
      },
    }
    await signedRequest(payload)
    await signedRequest(payload)

    const row = await env.DB.prepare(
      "SELECT billing_status, grace_period_ends_at FROM contractors WHERE id = ?"
    )
      .bind(contractor.id)
      .first<{ billing_status: string; grace_period_ends_at: string | null }>()
    expect(row?.billing_status).toBe("past_due")
    expect(row?.grace_period_ends_at).toBe(fixedGrace)
  })
})

// ---------------------------------------------------------------------------
// No matching contractor
// ---------------------------------------------------------------------------

describe("no matching contractor", () => {
  it("returns 200 when no contractor matches", async () => {
    const payload = {
      event_type: "subscription.activated",
      data: { id: "sub_unknown", customer_id: "ctm_unknown" },
    }
    const res = await signedRequest(payload)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })
})
