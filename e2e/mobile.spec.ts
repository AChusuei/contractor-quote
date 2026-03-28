import { test, expect } from "@playwright/test"

// ---------------------------------------------------------------------------
// Test 15: Intake form at 390px viewport — responsive layout
// ---------------------------------------------------------------------------

test.describe("Mobile — intake form at 390px viewport", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("15 - all fields visible, no horizontal overflow, form submittable", async ({ page }) => {
    await page.goto("/")

    // Verify viewport width
    const viewportWidth = page.viewportSize()?.width
    expect(viewportWidth).toBe(390)

    // Page should not have horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    expect(hasHorizontalOverflow).toBe(false)

    // All intake form fields should be visible
    await expect(page.getByLabel("Full Name")).toBeVisible()
    await expect(page.getByLabel("Email")).toBeVisible()
    await expect(page.getByLabel("Phone")).toBeVisible()
    await expect(page.getByLabel("Job Site Address")).toBeVisible()
    await expect(page.getByLabel("Property Type")).toBeVisible()
    await expect(page.getByLabel("Budget Range")).toBeVisible()
    await expect(page.getByLabel("How Did You Find Us?")).toBeVisible()
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible()

    // Fill form and submit to verify submittability
    await page.getByLabel("Full Name").fill("Mobile User")
    await page.getByLabel("Email").fill("mobile@test.com")
    await page.getByLabel("Phone").fill("(555) 000-1111")
    await page.getByLabel("Job Site Address").fill("100 Mobile St")
    await page.getByLabel("Property Type").selectOption("apt")
    await page.getByLabel("Budget Range").selectOption("<10k")
    await page.getByLabel("How Did You Find Us?").selectOption("google")

    // Submit should be clickable
    const continueButton = page.getByRole("button", { name: "Continue" })
    await expect(continueButton).toBeEnabled()
    await continueButton.click()

    // Should navigate to step 2 (or show validation)
    // If the API is running, we should see Step 2
    // If not, we may still navigate (localStorage fallback)
    await page.waitForTimeout(500)

    // Verify still no horizontal overflow after navigation
    const hasOverflowAfter = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    expect(hasOverflowAfter).toBe(false)
  })
})
