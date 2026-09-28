#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
exec docker compose run --rm --no-deps node "$@"
