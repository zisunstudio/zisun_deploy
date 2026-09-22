#!/usr/bin/env bash
# Deploy services from the LATEST commit on main:  scripts/railway/deploy.sh web worker beat
# Never pass "api" right after a push - the push already deploys it, and a
# second deploy races alembic (see CLAUDE.md). latestCommit:true is what makes
# Railway fetch the branch; without it a deploy rebuilds the old commit.
source "$(dirname "$0")/_common.sh"
[ $# -gt 0 ] || set -- web worker beat
for name in "$@"; do
  id="${SVC[$name]:?unknown service $name}"
  printf '%-7s ' "$name"
  gql "{\"query\":\"mutation { serviceInstanceDeploy(serviceId: \\\"$id\\\", environmentId: \\\"$ENV_ID\\\", latestCommit: true) }\"}"; echo
done
