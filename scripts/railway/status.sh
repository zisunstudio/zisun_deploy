#!/usr/bin/env bash
# What each service is actually running. Compare the commit with
# `git rev-parse --short HEAD` - SUCCESS alone only means a container started.
source "$(dirname "$0")/_common.sh"
for name in api worker beat web; do
  id="${SVC[$name]}"
  printf '%-7s ' "$name"
  gql "{\"query\":\"query { deployments(first: 1, input: {serviceId: \\\"$id\\\", environmentId: \\\"$ENV_ID\\\"}) { edges { node { status createdAt meta } } } }\"}" \
    | python3 -c "import sys,json;d=json.load(sys.stdin)['data']['deployments']['edges'];n=d[0]['node'] if d else {};m=n.get('meta') or {};print(n.get('status'),(m.get('commitHash') or '?')[:7],n.get('createdAt'))"
done
echo "main    $(git -C "$(dirname "$0")/../.." rev-parse --short HEAD)"
