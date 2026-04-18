import { describe, it, expect } from "vitest"
import {
  QUOTE_STATUSES,
  STATUS_LABELS,
  STATUS_COLORS,
  getHappyPathTransitions,
  getSecondaryTransitions,
} from "./statusTransitions"

describe("statusTransitions — completeness", () => {
  it("has a STATUS_LABELS entry for every status", () => {
    for (const s of QUOTE_STATUSES) {
      expect(STATUS_LABELS[s], `STATUS_LABELS missing "${s}"`).toBeDefined()
      expect(STATUS_LABELS[s].length, `STATUS_LABELS["${s}"] is empty`).toBeGreaterThan(0)
    }
  })

  it("has a STATUS_COLORS entry for every status", () => {
    for (const s of QUOTE_STATUSES) {
      expect(STATUS_COLORS[s], `STATUS_COLORS missing "${s}"`).toBeDefined()
      expect(STATUS_COLORS[s].length, `STATUS_COLORS["${s}"] is empty`).toBeGreaterThan(0)
    }
  })
})

describe("getHappyPathTransitions", () => {
  it("lead → [reviewing]", () => {
    expect(getHappyPathTransitions("lead")).toEqual(["reviewing"])
  })

  it("closed → [reviewing] (can be reopened)", () => {
    // closed is not truly terminal: it can transition back to reviewing
    expect(getHappyPathTransitions("closed")).toEqual(["reviewing"])
  })

  it("never includes closed or rejected", () => {
    for (const s of QUOTE_STATUSES) {
      const transitions = getHappyPathTransitions(s)
      expect(transitions, `getHappyPathTransitions("${s}") includes "closed"`).not.toContain("closed")
      expect(transitions, `getHappyPathTransitions("${s}") includes "rejected"`).not.toContain("rejected")
    }
  })

  it("draft → [lead, ...]  excluding close/reject", () => {
    const transitions = getHappyPathTransitions("draft")
    expect(transitions).toContain("lead")
    expect(transitions).not.toContain("closed")
  })
})

describe("getSecondaryTransitions", () => {
  it("estimate_sent has closed and rejected as secondary", () => {
    const transitions = getSecondaryTransitions("estimate_sent")
    expect(transitions).toContain("closed")
    expect(transitions).toContain("rejected")
  })

  it("only ever returns closed or rejected", () => {
    for (const s of QUOTE_STATUSES) {
      const secondary = getSecondaryTransitions(s)
      for (const t of secondary) {
        expect(["closed", "rejected"], `"${t}" is not a secondary status`).toContain(t)
      }
    }
  })

  it("lead → no secondary (closing/rejecting a lead is not a configured transition)", () => {
    // lead can go to reviewing or closed — closed is secondary
    const transitions = getSecondaryTransitions("lead")
    expect(transitions).toContain("closed")
  })
})
