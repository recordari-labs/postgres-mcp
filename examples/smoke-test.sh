#!/usr/bin/env bash
# Verify a running postgres-mcp instance: health, auth, and a read-only tool call.
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3000}"
MCP_URL="${BASE_URL%/}/mcp"
TOKEN="${MCP_TOKEN:?Set MCP_TOKEN to the bearer token configured in config.yaml}"

echo "== healthz =="
health="$(curl -fsS "${BASE_URL}/healthz")"
echo "$health"
echo "$health" | grep -q '"status":"ok"'

echo "== MCP without token (expect failure) =="
status="$(
  curl -sS -o /tmp/postgres-mcp-smoke-unauth.json -w '%{http_code}' \
    -H 'Accept: application/json, text/event-stream' \
    -H 'Content-Type: application/json' \
    -X POST "$MCP_URL" \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
)"
if [[ "$status" == "200" ]]; then
  echo "expected tools/list without a token to fail, got HTTP 200"
  exit 1
fi
echo "HTTP $status (rejected as expected)"

echo "== MCP list_schemas =="
body='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_schemas","arguments":{}}}'
response="$(curl -fsS \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Content-Type: application/json' \
  -X POST "$MCP_URL" \
  -d "$body")"
echo "$response"
echo "$response" | grep -q 'list_schemas\|schemas'

echo "== MCP execute_query smoke =="
sql='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"execute_query","arguments":{"sql":"SELECT 1 AS ok"}}}'
response="$(curl -fsS \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Content-Type: application/json' \
  -X POST "$MCP_URL" \
  -d "$sql")"
echo "$response"
echo "$response" | grep -q '"ok"'

echo "OK: postgres-mcp passed smoke checks at ${BASE_URL}"