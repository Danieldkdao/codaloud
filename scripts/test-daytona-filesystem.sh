#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ "$(uname -s)" == "Linux" ]]; then
  exec pnpm exec vitest run src/services/daytona/tests/filesystem.test.ts
fi

# Run the real Node command on Linux; mocking procfs on macOS cannot establish
# that directory descriptors remain anchored during concurrent renames.
fixture_dir=$(mktemp -d "${TMPDIR:-/tmp}/codaloud-filesystem.XXXXXX")
fixture_dir=$(cd "$fixture_dir" && pwd -P)
container_name="codaloud-filesystem-${fixture_dir##*.}"
container_id=""
cleanup() {
  if [[ -n "$container_id" ]]; then docker rm -f "$container_id" >/dev/null; fi
  rm -rf "$fixture_dir"
}
trap cleanup EXIT

container_id=$(docker run --rm -d --name "$container_name" \
  --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --mount "type=bind,source=$fixture_dir,target=$fixture_dir" \
  node:24-bookworm-slim sleep infinity)

TMPDIR="$fixture_dir" CODALOUD_TEST_SANDBOX_CONTAINER="$container_name" \
  pnpm exec vitest run src/services/daytona/tests/filesystem.test.ts
