#!/bin/sh
# Grove Clash launcher — finds whatever runtime exists and serves the game.
# (Replit's Run button executes this via .replit.)
cd "$(dirname "$0")" || exit 1

if command -v python3 >/dev/null 2>&1; then exec python3 serve.py; fi
if command -v python  >/dev/null 2>&1; then exec python  serve.py; fi
if command -v node    >/dev/null 2>&1; then exec node    serve.js; fi

echo "No python or node runtime found."
echo "Open grove-clash-standalone.html directly in any browser instead -"
echo "the whole game is inside that one file, no server needed."
exit 1
