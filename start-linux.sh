#!/bin/bash
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Please install Node.js (LTS) from https://nodejs.org first."; exit 1; }
( sleep 2; xdg-open "http://localhost:3000/" >/dev/null 2>&1; xdg-open "http://localhost:3000/admin/" >/dev/null 2>&1 ) &
node server.js
