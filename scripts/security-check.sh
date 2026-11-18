#!/usr/bin/env bash
# Re-runnable security check executed after every security patch.
# Verifies:
#   1. Dependency advisories (npm audit, high+critical).
#   2. line-notify edge function enforces a status whitelist and auth checks.
#   3. No edge function interpolates an unvalidated `status` field into outbound text.
#
# Exit code != 0 indicates a regression. Wire this into CI and run locally
# via `bun run security:check` after any security-related change.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail=0
section() { printf "\n\033[1m== %s ==\033[0m\n" "$1"; }
ok()      { printf "  \033[32m✓\033[0m %s\n" "$1"; }
bad()     { printf "  \033[31m✗\033[0m %s\n" "$1"; fail=1; }

section "1. Dependency audit (high+critical)"
if command -v npm >/dev/null 2>&1; then
  audit_json="$(npm audit --json --audit-level=high 2>/dev/null || true)"
  high=$(printf '%s' "$audit_json" | grep -o '"high":[0-9]*' | head -n1 | cut -d: -f2)
  crit=$(printf '%s' "$audit_json" | grep -o '"critical":[0-9]*' | head -n1 | cut -d: -f2)
  high=${high:-0}; crit=${crit:-0}
  if [ "$high" -gt 0 ] || [ "$crit" -gt 0 ]; then
    bad "npm audit reports $high high / $crit critical advisories. Run 'npm audit' for details."
  else
    ok "No high/critical advisories."
  fi
else
  bad "npm not available; cannot run dependency audit."
fi

section "2. line-notify status whitelist"
LN="supabase/functions/line-notify/index.ts"
if [ ! -f "$LN" ]; then
  bad "$LN missing."
else
  if grep -q "hasOwnProperty.call(statusLabel, status)" "$LN" \
     || grep -qE 'ALLOWED.*\.has\(status\)' "$LN" \
     || grep -q 'isValidStatus(effectiveStatus)' "$LN"; then
    ok "Whitelist guard present."
  else
    bad "Whitelist guard for 'status' not found in $LN."
  fi
  if grep -q '\${statusLabel\[status\] || status}' "$LN"; then
    bad "Fallback to raw user-supplied status string detected — injection risk."
  else
    ok "No fallback to raw status string."
  fi
  if grep -q 'getClaims' "$LN" && grep -q "kind === \"status_update\"" "$LN" && grep -q "isStaff" "$LN"; then
    ok "Auth + staff role check present."
  else
    bad "Auth or staff role check missing."
  fi
fi

section "3. Other *notify* edge functions — no unvalidated status interpolation"
offenders=$(find supabase/functions -type f -name 'index.ts' 2>/dev/null \
  | grep -i notify | grep -v "$LN" \
  | xargs -r grep -lE '\$\{.*\bstatus\b.*\}' 2>/dev/null || true)
if [ -z "$offenders" ]; then
  ok "No other functions interpolate \`status\` into strings."
else
  bad "Review these functions for status injection:"
  printf '    %s\n' $offenders
fi

echo
if [ "$fail" -eq 0 ]; then
  printf "\033[32mSecurity check passed.\033[0m\n"
  exit 0
else
  printf "\033[31mSecurity check FAILED.\033[0m See findings above.\n"
  exit 1
fi