import { test, expect } from "@playwright/test"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fill the Step 1 intake form with valid data */
async function fillStep1(page: import("@playwright/test").Page) {
  await page.getByLabel("Full Name").fill("Jane Doe")
  await page.getByLabel("Email").fill("jane@example.com")
  await page.getByLabel("Phone").fill("(718) 555-1234")
  await page.getByLabel("Job Site Address").fill("123 Main St, New York, NY 10001")
  await page.getByLabel("Property Type").selectOption("house")
  await page.getByLabel("Budget Range").selectOption("25-50k")
  await page.getByLabel("How Did You Find Us?").selectOption("referral")
}

/** Fill the Step 2 scope form with valid data */
async function fillStep2(page: import("@playwright/test").Page) {
  await page.getByText("Supply + install").click()
  await page.getByText("No", { exact: true }).first().click() // layout changes
  await page.getByText("Medium (70–150 sq ft)").click()
  await page.getByText("New cabinets").click()
  await page.getByLabel("Cabinet door style").selectOption("Shaker")
  await page.getByLabel("Countertop material").selectOption("Quartz")
  await page.getByLabel("Edge profile").selectOption("Eased")
  await page.getByLabel("Sink type").selectOption("Undermount single basin")
  await page.getByText("Yes", { exact: true }).nth(1).click() // backsplash
  await page.getByText("Keep existing").click() // flooring
  await page.getByText("None", { exact: true }).first().click() // island/peninsula
  await page.getByText("No, I have a clear vision").click() // design help
}

// ---------------------------------------------------------------------------
// Test 1: Full intake flow — rough estimate path
// ---------------------------------------------------------------------------

test.describe("Intake Flow", () => {
  test("1 - customer submits quote through full 4-step flow", async ({ page }) => {
    await page.goto("/")

    // Step 1 of 4
    await expect(page.getByText("Step 1 of 4")).toBeVisible()
    await expect(page.getByText("Request a Quote")).toBeVisible()

    await fillStep1(page)
    await page.getByRole("button", { name: "Continue" }).click()

    // Step 2 of 4 — Project Scope
    await expect(page.getByText("Step 2 of 4")).toBeVisible()
    await expect(page.getByText("Project Scope")).toBeVisible()

    await fillStep2(page)
    await page.getByRole("button", { name: "Continue" }).click()

    // Step 3 of 4 — Photos
    await expect(page.getByText("Step 3 of 4")).toBeVisible()
    await expect(page.getByText("Photos").first()).toBeVisible()

    // Skip photos
    await page.getByRole("button", { name: /skip/i }).click()

    // Step 4 of 4 — Review
    await expect(page.getByText("Step 4 of 4")).toBeVisible()
    await expect(page.getByText("Review Your Request")).toBeVisible()

    // Verify data is displayed in the review
    await expect(page.getByText("Jane Doe")).toBeVisible()
    await expect(page.getByText("jane@example.com")).toBeVisible()

    // Submit
    await page.getByRole("button", { name: "Submit Request" }).click()

    // Confirmation page
    await expect(page.getByText("Request Received")).toBeVisible()
    await expect(page.getByText("Your quote request has been submitted successfully")).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // Test 2: Site visit path (the flow completes after review submission)
  // ---------------------------------------------------------------------------

  test("2 - customer submits quote and reaches confirmation", async ({ page }) => {
    await page.goto("/")
    await fillStep1(page)
    await page.getByRole("button", { name: "Continue" }).click()

    // Step 2
    await expect(page.getByText("Step 2 of 4")).toBeVisible()
    await fillStep2(page)
    await page.getByRole("button", { name: "Continue" }).click()

    // Step 3 — skip photos
    await page.getByRole("button", { name: /skip/i }).click()

    // Step 4 — review and submit
    await page.getByRole("button", { name: "Submit Request" }).click()

    // Should land on confirmation
    await expect(page.getByText("Request Received")).toBeVisible()

    // Verify "Return home" goes back to intake
    await page.getByRole("button", { name: "Return home" }).click()
    await expect(page.getByText("Request a Quote")).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // Test 3: Photo upload shows thumbnail area
  // ---------------------------------------------------------------------------

  test("3 - photo upload page shows upload area", async ({ page }) => {
    await page.goto("/")
    await fillStep1(page)
    await page.getByRole("button", { name: "Continue" }).click()

    await fillStep2(page)
    await page.getByRole("button", { name: "Continue" }).click()

    // Step 3 — Photos page
    await expect(page.getByText("Step 3 of 4")).toBeVisible()
    await expect(page.getByText("Upload photos of your existing kitchen")).toBeVisible()

    // The file upload component should be present (drop area)
    // The "Continue" and "Skip" buttons should be visible
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible()
    await expect(page.getByRole("button", { name: /skip/i })).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // Test 4: Form validation fires on blur
  // ---------------------------------------------------------------------------

  test("4 - form validation fires on blur for required fields", async ({ page }) => {
    await page.goto("/")

    // Focus and blur name — should show required error
    const nameInput = page.getByLabel("Full Name")
    await nameInput.focus()
    await nameInput.blur()
    await expect(page.getByText("Name is required")).toBeVisible()

    // Focus and blur email with invalid value
    const emailInput = page.getByLabel("Email")
    await emailInput.fill("not-an-email")
    await emailInput.blur()
    await expect(page.getByText("Enter a valid email")).toBeVisible()

    // Focus and blur phone with too-short value
    const phoneInput = page.getByLabel("Phone")
    await phoneInput.fill("555")
    await phoneInput.blur()
    await expect(page.getByText("Enter a valid phone number")).toBeVisible()
  })
})
