#!/bin/sh
# eve dev loads only .env.local from this directory; local settings live in the repo-root
# .env.dev (see .env.example). Export them, then run the given command.
set -a
[ -f ../../.env.dev ] && . ../../.env.dev
set +a
exec "$@"
