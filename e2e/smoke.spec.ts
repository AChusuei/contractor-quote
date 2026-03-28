import { test, expect } from "@playwright/test"

test("API health check returns ok", async ({ request }) => {
  const res = await request.get("http://localhost:8787/health")
  expect(res.ok()).toBe(true)
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(body.data.status).toBe("ok")
})

test("frontend loads", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveTitle(/.+/)
})
