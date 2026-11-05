#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed yet. It is a free, one-time install."
  echo "Opening the download page. Install the LTS version, then double-click this file again."
  open "https://nodejs.org/en/download"
  read -p "Press Enter to close..." x; exit 1
fi
echo "Starting Kilo Kitchen. Keep this window open; close it to stop the website."
( sleep 2; open "http://localhost:3000/"; open "http://localhost:3000/admin/" ) &
node server.js
