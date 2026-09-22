# Shared by the Railway helpers. No secrets live here: the token is read
# from $RAILWAY_TOKEN or ~/.config/zisun/railway_token (mode 600), which
# survives session resets - the scratchpad copies were lost three times.
set -euo pipefail
TOK="${RAILWAY_TOKEN:-$(cat ~/.config/zisun/railway_token 2>/dev/null || true)}"
[ -n "$TOK" ] || { echo "No Railway token: set RAILWAY_TOKEN or write ~/.config/zisun/railway_token" >&2; exit 1; }
ENV_ID=6f93df9f-32d1-4cd4-9dfa-6b5d8e763f28
declare -A SVC=(
  [api]=ceded69b-ec39-40c9-a1ce-d0c34a30400c
  [worker]=f0d6ec51-487c-4241-a386-3df6e64eca91
  [beat]=13dd6cab-808f-499d-abbc-892207f81449
  [web]=135000fe-7fdd-42e9-8684-7fb62ba0953a
)
gql() { curl -s https://backboard.railway.app/graphql/v2 -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "$1"; }
