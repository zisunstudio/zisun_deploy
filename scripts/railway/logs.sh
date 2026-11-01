#!/usr/bin/env bash
# Read-only: recent log lines of a service's running deployment.
#   scripts/railway/logs.sh <api|web|worker|beat> [filter] [limit]
source "$(dirname "$0")/_common.sh"
svc="${1:-api}"; filter="${2:-}"; limit="${3:-200}"
id="${SVC[$svc]}"
dep=$(gql "{\"query\":\"query { deployments(first: 6, input: {serviceId: \\\"$id\\\", environmentId: \\\"$ENV_ID\\\"}) { edges { node { id status } } } }\"}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin)['data']['deployments']['edges'];s=[e['node'] for e in d if e['node']['status']=='SUCCESS'];print(s[0]['id'] if s else '')")
[ -n "$dep" ] || { echo "no running $svc deployment"; exit 1; }
gql "{\"query\":\"query { deploymentLogs(deploymentId: \\\"$dep\\\", limit: $limit, filter: \\\"$filter\\\") { timestamp message } }\"}" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
if d.get('errors'): print(d['errors']); sys.exit()
for l in d['data']['deploymentLogs']: print(l['timestamp'][:19], l['message'][:600])"
