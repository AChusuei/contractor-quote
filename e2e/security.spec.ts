import { test, expect } from "@playwright/test"

const API_BASE = "http://localhost:8787/api/v1"

// ---------------------------------------------------------------------------
// Test 10: Intake pages don't leak admin UI
// ---------------------------------------------------------------------------

test.describe("Security — UI isolation", () => {
  const intakeRoutes = ["/", "/intake/scope", "/intake/photos", "/intake/review", "/intake/confirmation"]

  for (const route of intakeRoutes) {
    test(`10 - intake route ${route} does not expose admin nav or Clerk UI`, async ({ page }) => {
      await page.goto(route)

      // No admin navigation links
      await expect(page.getByRole("link", { name: "Quotes" })).not.toBeVisible()
      await expect(page.getByRole("link", { name: "Settings" })).not.toBeVisible()

      // No Clerk UserButton — it renders a button with role=button inside a
      // container with class cl-userButtonTrigger or similar. We check for its absence.
      const clerkButton = page.locator(".cl-userButtonTrigger, .cl-userButton-root, [data-clerk-component]")
      await expect(clerkButton).toHaveCount(0)

      // The admin shell nav should not be in the DOM at all
      const adminNav = page.locator("nav").filter({ hasText: "Quotes" })
      await expect(adminNav).toHaveCount(0)
    })
  }
})

// ---------------------------------------------------------------------------
// Test 11: Admin routes redirect/block unauthenticated users
// ---------------------------------------------------------------------------

test.describe("Security — admin route protection", () => {
  const adminRoutes = ["/admin/quotes", "/admin/quotes/some-id", "/admin/settings", "/admin/email/compose"]

  for (const route of adminRoutes) {
    test(`11 - ${route} redirects or shows sign-in when unauthenticated`, async ({ page }) => {
      await page.goto(route)

      // Without Clerk configured, the app renders ClerkNotConfigured
      // With Clerk configured but no session, it redirects to /admin/sign-in
      // Either way, the admin content (Quotes heading, etc.) should NOT be accessible
      const quotesHeading = page.getByRole("heading", { name: "Quotes" })
      const settingsHeading = page.getByRole("heading", { name: "Settings" })

      // At least one of these outcomes:
      // 1. We see "Clerk is not configured" message
      // 2. We're redirected to sign-in
      // 3. We see a loading state but NOT the actual admin content
      const isClerkNotConfigured = await page.getByText(/clerk is not configured/i).isVisible().catch(() => false)
      const isOnSignIn = page.url().includes("/admin/sign-in")
      const hasNoAdminContent = !(await quotesHeading.isVisible().catch(() => false)) && !(await settingsHeading.isVisible().catch(() => false))

      expect(isClerkNotConfigured || isOnSignIn || hasNoAdminContent).toBe(true)
    })
  }
})

// ---------------------------------------------------------------------------
// Test 12: Admin API endpoints reject unauthenticated requests (401)
// ---------------------------------------------------------------------------

test.describe("Security — API auth enforcement", () => {
  test("12a - GET /quotes/:id returns 401 without auth", async ({ request }) => {
    const res = await request.get(`${API_BASE}/quotes/some-fake-id`)
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })

  test("12b - PATCH /quotes/:id returns 401 without auth", async ({ request }) => {
    const res = await request.patch(`${API_BASE}/quotes/some-fake-id`, {
      data: { status: "reviewing" },
    })
    expect(res.status()).toBe(401)
  })

  test("12c - GET /contractors/:id/quotes returns 401 without auth", async ({ request }) => {
    const res = await request.get(`${API_BASE}/contractors/00000000-0000-4000-8000-000000000001/quotes`)
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })

  test("12d - DELETE /quotes/:id/photos/:photoId returns 401 without auth", async ({ request }) => {
    const res = await request.delete(`${API_BASE}/quotes/fake-q/photos/fake-p`)
    expect(res.status()).toBe(401)
  })

  test("12e - GET /staff returns 401 without auth", async ({ request }) => {
    const res = await request.get(`${API_BASE}/staff`)
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Test 13: Public quote POST response only contains {id, publicToken}
// ---------------------------------------------------------------------------

test.describe("Security — response data leakage", () => {
  test("13 - POST /quotes response only contains id and publicToken", async ({ request }) => {
    const res = await request.post(`${API_BASE}/quotes`, {
      data: {
        schemaVersion: 1,
        contractorId: "00000000-0000-4000-8000-000000000001",
        status: "draft",
        name: "Test User",
        email: "test@example.com",
        phone: "(555) 123-4567",
        jobSiteAddress: "456 Oak Ave",
        propertyType: "house",
        budgetRange: "10-25k",
        howDidYouFindUs: "google",
      },
    })

    // May get 201 (created) or 422 (contractor not found in D1 during E2E)
    // If the API is running with seeded data, it should be 201
    if (res.status() === 201) {
      const body = await res.json()
      expect(body.ok).toBe(true)

      // Data field should only have id and publicToken
      const dataKeys = Object.keys(body.data)
      expect(dataKeys).toContain("id")
      expect(dataKeys).toContain("publicToken")

      // Must NOT contain sensitive fields
      expect(dataKeys).not.toContain("status")
      expect(dataKeys).not.toContain("contractorNotes")
      expect(dataKeys).not.toContain("scope")
      expect(dataKeys).not.toContain("email")
      expect(dataKeys).not.toContain("phone")

      // Exactly 2 fields
      expect(dataKeys).toHaveLength(2)
    }
  })
})

// ---------------------------------------------------------------------------
// Test 14: Tenant isolation — contractor A cannot access contractor B's quotes
// ---------------------------------------------------------------------------

test.describe("Security — tenant isolation", () => {
  test("14 - contractor A cannot access contractor B quotes via API", async ({ request }) => {
    // Try to access contractor-002's quotes using 00000000-0000-4000-8000-000000000001's auth header
    // In dev mode, x-contractor-id is accepted
    const res = await request.get(`${API_BASE}/contractors/contractor-002/quotes`, {
      headers: { "x-contractor-id": "00000000-0000-4000-8000-000000000001" },
    })

    // Should be 403 Forbidden (00000000-0000-4000-8000-000000000001 trying to access contractor-002's data)
    expect(res.status()).toBe(403)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })
})
