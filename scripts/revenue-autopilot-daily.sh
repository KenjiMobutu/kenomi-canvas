#!/bin/sh
set -eu

lock=/tmp/kenomi-revenue-autopilot.lock
log=/home/claude/kenomi/revenue-autopilot.log

(
  flock -n 9 || {
    echo "$(date -Iseconds) kenomi revenue autopilot: already running" >> "$log"
    exit 0
  }

  container="$(docker ps --filter label=coolify.applicationId=3 --format '{{.Names}}' | head -1)"
  if [ -z "$container" ]; then
    echo "$(date -Iseconds) kenomi revenue autopilot: app container not found" >&2
    exit 1
  fi

  echo "$(date -Iseconds) kenomi revenue autopilot: start $container" >> "$log"
  docker exec "$container" npm run revenue:autopilot >> "$log" 2>&1
  echo "$(date -Iseconds) kenomi revenue autopilot: done" >> "$log"
) 9>"$lock"
