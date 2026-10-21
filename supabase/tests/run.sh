#!/usr/bin/env bash
# Runs the migration + seed + end-to-end security test against a throwaway
# local Postgres with PostGIS. Usage: PGHOST=... PGPORT=... PGUSER=... npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."
DB="matchday_test_$$"
P="psql -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "create database $DB" >/dev/null
trap '$P -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
$P -d "$DB" -f tests/supabase_stub.sql 2>&1 | grep -v -i -E "wal_level|HINT" || true
for m in migrations/*.sql; do $P -d "$DB" -f "$m"; done
$P -d "$DB" -f seed.sql
$P -d "$DB" -f tests/e2e_test.sql | grep -E "ALL_TESTS_PASSED|ERROR|FAIL" || { echo "Tests failed"; exit 1; }
