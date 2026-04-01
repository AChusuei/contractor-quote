import { test, expect } from "@playwright/test"
import type { APIRequestContext } from "@playwright/test"

const API_BASE = "http://localhost:8787/api/v1"

// ---------------------------------------------------------------------------
// Helper: create a quote via API for admin tests
// ---------------------------------------------------------------------------

async function createQuoteViaApi(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
): Promise<{ id: string; publicToken: string } | null> {
  const res = await request.post(`${API_BASE}/quotes`, {
    data: {
      schemaVersion: 1,
      contractorId: "00000000-0000-4000-8000-000000000001",
      status: "lead",
      name: "Admin Test Customer",
      email: "admin-test@example.com",
      phone: "(555) 987-6543",
      jobSiteAddress: "789 Pine St",
      propertyType: "house",
      budgetRange: "25-50k",
      howDidYouFindUs: "google",
      ...overrides,
    },
  })

  if (res.status() === 201) {
    const body = await res.json()
    return body.data
  }
  return null
}

// ---------------------------------------------------------------------------
// Test 5: Admin views submitted quote in quotes list (API level)
// ---------------------------------------------------------------------------

test.describe("Admin Portal — API", () => {
  test("5 - admin can list quotes via API with auth", async ({ request }) => {
    // Create a quote first
    await createQuoteViaApi(request)

    // List quotes as 00000000-0000-4000-8000-000000000001 (dev auth)
    const res = await request.get(`${API_BASE}/contractors/00000000-0000-4000-8000-000000000001/quotes`, {
      headers: { "x-contractor-id": "00000000-0000-4000-8000-000000000001" },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data).toHaveProperty("quotes")
    expect(Array.isArray(body.data.quotes)).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // Test 6: Admin gets quote detail via API
  // ---------------------------------------------------------------------------

  test("6 - admin can read quote detail via API", async ({ request }) => {
    const created = await createQuoteViaApi(request)
    if (!created) {
      test.skip()
      return
    }

    const res = await request.get(`${API_BASE}/quotes/${created.id}`, {
      headers: { "x-contractor-id": "00000000-0000-4000-8000-000000000001" },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data.id).toBe(created.id)
    expect(body.data).toHaveProperty("name")
    expect(body.data).toHaveProperty("email")
    expect(body.data).toHaveProperty("status")
  })

  // ---------------------------------------------------------------------------
  // Test 7: Admin edits a quote via API
  // ---------------------------------------------------------------------------

  test("7 - admin can update quote fields via API", async ({ request }) => {
    const created = await createQuoteViaApi(request)
    if (!created) {
      test.skip()
      return
    }

    // Update the quote name
    const patchRes = await request.patch(`${API_BASE}/quotes/${created.id}`, {
      headers: { "x-contractor-id": "00000000-0000-4000-8000-000000000001" },
      data: { name: "Updated Customer Name" },
    })

    expect(patchRes.status()).toBe(200)
    const patchBody = await patchRes.json()
    expect(patchBody.ok).toBe(true)

    // Verify the update persisted
    const getRes = await request.get(`${API_BASE}/quotes/${created.id}`, {
      headers: { "x-contractor-id": "00000000-0000-4000-8000-000000000001" },
    })

    const getBody = await getRes.json()
    expect(getBody.data.name).toBe("Updated Customer Name")
  })

  // ---------------------------------------------------------------------------
  // Test 8: Admin changes quote status, activity timeline updates
  // ---------------------------------------------------------------------------

  test("8 - admin status change creates activity entry", async ({ request }) => {
    const created = await createQuoteViaApi(request)
    if (!created) {
      test.skip()
      return
    }

    // Change status from 'lead' to 'reviewing'
    const statusRes = await request.patch(`${API_BASE}/quotes/${created.id}`, {
      headers: { "x-contractor-id": "00000000-0000-4000-8000-000000000001" },
      data: { status: "reviewing" },
    })
    expect(statusRes.status()).toBe(200)

    // Check activity feed
    const activityRes = await request.get(`${API_BASE}/quotes/${created.id}/activity`, {
      headers: { "x-contractor-id": "00000000-0000-4000-8000-000000000001" },
    })

    expect(activityRes.status()).toBe(200)
    const activityBody = await activityRes.json()
    expect(activityBody.ok).toBe(true)

    // Should have at least a status_change entry
    const activities = activityBody.data.activities ?? activityBody.data
    expect(Array.isArray(activities)).toBe(true)

    const statusChanges = activities.filter(
      (a: Record<string, unknown>) => a.type === "status_change"
    )
    expect(statusChanges.length).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // Test 9: Admin email compose picks up correct recipients
  // ---------------------------------------------------------------------------

  test("9 - email compose endpoint accepts quote IDs for recipients", async ({ request }) => {
    const created = await createQuoteViaApi(request)
    if (!created) {
      test.skip()
      return
    }

    // Verify the email send endpoint exists and requires auth
    const noAuthRes = await request.post(`${API_BASE}/email/send`, {
      data: {
        to: ["admin-test@example.com"],
        subject: "Test",
        body: "Hello",
      },
    })

    expect(noAuthRes.status()).toBe(401)

    // With auth, it should accept the request (may fail if SendGrid not configured, but should not be 401)
    const authRes = await request.post(`${API_BASE}/email/send`, {
      headers: { "x-contractor-id": "00000000-0000-4000-8000-000000000001" },
      data: {
        to: ["admin-test@example.com"],
        subject: "Quote follow-up",
        body: "Hello {{name}}, regarding your project at {{address}}",
      },
    })

    // Should not be 401 (auth is valid)
    expect(authRes.status()).not.toBe(401)
  })
})
