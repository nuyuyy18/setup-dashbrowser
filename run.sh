#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
while true; do
  echo "[$(date)] Starting DashBrowser Web Server..."
  node "$DIR/server/index.js"
  echo "[$(date)] Server crashed or stopped. Restarting in 2s..."
  sleep 2
done
