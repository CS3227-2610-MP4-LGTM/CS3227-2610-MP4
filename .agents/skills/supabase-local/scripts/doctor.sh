#!/usr/bin/env sh
# Checks that the local Supabase stack can run. Read-only; prints no keys.
# Run from the repository root.

failed=0

pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; failed=1; }

if docker info >/dev/null 2>&1; then
  pass "Docker is running"
else
  fail "Docker is not running: start Docker Desktop, then rerun"
fi

if version=$(bunx supabase --version 2>/dev/null); then
  pass "Supabase CLI $version (pinned in package.json)"
else
  fail "Supabase CLI not found: run bun install --frozen-lockfile"
fi

if [ -f supabase/config.toml ]; then
  pass "supabase/config.toml found"
else
  fail "supabase/config.toml not found: run this from the repository root"
fi

if bunx supabase status >/dev/null 2>&1; then
  pass "Local stack is running (Studio: http://127.0.0.1:54323)"
else
  fail "Local stack is not running: bun run db:start"
fi

# Existence check only; never read the file.
if [ -f .env.local ]; then
  pass ".env.local exists"
else
  fail ".env.local is missing: a human must create it (see the skill's Environment variables section)"
fi

exit "$failed"
