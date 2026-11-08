#!/usr/bin/env bash
# Runs the whole end-to-end checkpoint: builds the app, starts it on port 3100, opens a temporary
# Cloudflare tunnel, registers a temporary PayPal sandbox webhook, runs the checks, then removes
# everything it started. Real sandbox charges and refunds. Run from the repo root.
#   bash scripts/e2e-with-tunnel.sh
set -uo pipefail
PORT=3100
LOG=$(mktemp -d)
SERVER_PID=""; TUNNEL_PID=""; WEBHOOK_ID=""

cleanup() {
  [ -n "$WEBHOOK_ID" ] && node --env-file=.env.local scripts/webhook.mjs delete "$WEBHOOK_ID" || true
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  pkill -f "next start -p $PORT" 2>/dev/null; pkill -f "next dev -p $PORT" 2>/dev/null
  true
}
trap cleanup EXIT

# E2E_LOCAL=1: use the dev server and the local file ledger (log in as demo@north.local), with the saved PayPal copied from
# Supabase. Use it when Supabase has not had the newest migration yet. Otherwise: a production build against Supabase.
if [ "${E2E_LOCAL:-}" != "1" ]; then
  npm run build >"$LOG/build.log" 2>&1 || { echo "Build failed:"; tail -20 "$LOG/build.log"; exit 1; }
fi

cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate >"$LOG/tunnel.log" 2>&1 &
TUNNEL_PID=$!
URL=""
for _ in $(seq 1 40); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG/tunnel.log" | head -1)
  [ -n "$URL" ] && break; sleep 1
done
[ -z "$URL" ] && { echo "No tunnel URL"; exit 1; }

REG=$(node --env-file=.env.local scripts/webhook.mjs register "$URL") || { echo "$REG"; exit 1; }
WEBHOOK_ID=$(echo "$REG" | sed -n 's/^PAYPAL_WEBHOOK_ID=//p')

if [ "${E2E_LOCAL:-}" = "1" ]; then
  PAYPAL_WEBHOOK_ID="$WEBHOOK_ID" SUPABASE_URL= SUPABASE_SECRET_KEY= NORTH_DEV_RATE_MULTIPLIER=20 npx next dev -p "$PORT" >"$LOG/server.log" 2>&1 &
else
  PAYPAL_WEBHOOK_ID="$WEBHOOK_ID" DEMO_MODE=1 DEMO_DEPLOYMENT=1 npx next start -p "$PORT" >"$LOG/server.log" 2>&1 &
fi
SERVER_PID=$!
for _ in $(seq 1 40); do curl -s -o /dev/null "localhost:$PORT/login" && break; sleep 1; done
if [ "${E2E_LOCAL:-}" = "1" ]; then
  node --env-file=.env.local --input-type=module -e "
    const { login } = await import('./scripts/lib/session.mjs'); await login('http://localhost:$PORT');" || exit 1
  node --env-file=.env.local scripts/vault-to-local.mjs || exit 1
fi

BASE_URL="http://localhost:$PORT" node scripts/e2e-checkpoint.mjs
CODE=$?
echo; echo "(server log: $LOG/server.log)"
exit $CODE
