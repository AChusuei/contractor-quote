#!/usr/bin/env bash
# integration-test.sh — Spin up full stack and run Playwright E2E tests
#
# Usage: npm run test:integration
#
# Works locally and in CI (GitHub Actions). Starts wrangler dev (API) and
# vite dev (frontend), applies D1 migrations, waits for both to be healthy,
# runs the Playwright suite, then tears everything down.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
API_PORT=8787
VITE_PORT=5173
PIDS=()

# ---------------------------------------------------------------------------
# Cleanup — always kill background servers on exit
# ---------------------------------------------------------------------------
cleanup() {
  echo ""
  echo "🧹 Tearing down servers..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
  echo "✓ Cleanup complete"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Wait for a URL to return HTTP 200
# ---------------------------------------------------------------------------
wait_for() {
  local url="$1"
  local label="$2"
  local max_attempts=30
  local attempt=0

  echo "⏳ Waiting for $label ($url)..."
  while [ $attempt -lt $max_attempts ]; do
    if curl -sf "$url" > /dev/null 2>&1; then
      echo "✓ $label is ready"
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done

  echo "✗ $label failed to start after ${max_attempts}s"
  return 1
}

# ---------------------------------------------------------------------------
# 1. Apply D1 migrations (local)
# ---------------------------------------------------------------------------
echo "📦 Applying D1 migrations..."
for migration in "$API_DIR"/migrations/*.sql; do
  npx wrangler d1 execute contractor-quote-db --local --file="$migration" --config="$API_DIR/wrangler.toml" 2>&1 | tail -1
done
echo "✓ Migrations applied"

# ---------------------------------------------------------------------------
# 2. Start wrangler dev (API server)
# ---------------------------------------------------------------------------
echo "🚀 Starting API server (wrangler dev)..."
npx wrangler dev --config="$API_DIR/wrangler.toml" --port "$API_PORT" --local > /tmp/cq-api.log 2>&1 &
PIDS+=($!)

# ---------------------------------------------------------------------------
# 3. Start vite dev (frontend)
# ---------------------------------------------------------------------------
echo "🚀 Starting frontend (vite dev)..."
npx vite --port "$VITE_PORT" > /tmp/cq-vite.log 2>&1 &
PIDS+=($!)

# ---------------------------------------------------------------------------
# 4. Wait for both servers to be healthy
# ---------------------------------------------------------------------------
wait_for "http://localhost:$API_PORT/health" "API"
wait_for "http://localhost:$VITE_PORT" "Frontend"

# ---------------------------------------------------------------------------
# 5. Run Playwright E2E suite
# ---------------------------------------------------------------------------
echo ""
echo "🧪 Running Playwright E2E tests..."
npx playwright test --config="$ROOT_DIR/playwright.config.ts"
TEST_EXIT=$?

echo ""
if [ $TEST_EXIT -eq 0 ]; then
  echo "✅ Integration tests passed"
else
  echo "❌ Integration tests failed (exit code: $TEST_EXIT)"
fi

exit $TEST_EXIT
