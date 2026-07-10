#!/usr/bin/env bash
# Party Station TV kiosk launcher.
#
# Started by the desktop session at login (setup-pi.sh wires it into the
# session's autostart). Waits for the game server, then runs Chromium
# fullscreen on the TV view — and relaunches it if it ever exits, so the
# TV always shows the console.
#
# Getting out (troubleshooting with an attached keyboard): press
# Ctrl+Alt+Q on the TV page — the server drops a stop flag, this script
# closes Chromium and exits instead of relaunching, leaving the desktop.
# Get back in by running `party-station-kiosk` (or this script) from any
# terminal, including over SSH.
set -u

URL="${KIOSK_URL:-http://localhost/tv}"

# When relaunched from SSH or a virtual terminal there's no display in the
# environment — aim at the Pi's desktop session.
if [ -z "${WAYLAND_DISPLAY:-}" ] && [ -z "${DISPLAY:-}" ]; then
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  if [ -S "$XDG_RUNTIME_DIR/wayland-0" ]; then
    export WAYLAND_DISPLAY=wayland-0
  else
    export DISPLAY=:0
  fi
fi

# Only one kiosk per boot, even if two autostart mechanisms both fire.
exec 9>"${XDG_RUNTIME_DIR:-/tmp}/party-station-kiosk.lock"
flock -n 9 || exit 0

BROWSER=""
for c in chromium-browser chromium; do
  if command -v "$c" >/dev/null 2>&1; then BROWSER="$c"; break; fi
done
if [ -z "$BROWSER" ]; then
  echo "party-station-kiosk: no Chromium found" >&2
  exit 1
fi

# Give the game server (and the network) up to 2 minutes to come up.
for _ in $(seq 1 120); do
  curl -fsS -m 2 -o /dev/null "$URL" && break
  sleep 1
done

# The TV must never show a mouse cursor. CSS hides it once the pointer moves
# over the page, but the compositor keeps drawing its own arrow until then —
# so point Chromium at the repo's fully transparent cursor theme (honored by
# both X11 and Wayland Chromium), and nudge the pointer off-screen if a tool
# for that exists.
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -d "$REPO_DIR/scripts/cursors/blank" ]; then
  export XCURSOR_PATH="$REPO_DIR/scripts/cursors${XCURSOR_PATH:+:$XCURSOR_PATH}"
  export XCURSOR_THEME=blank
  export XCURSOR_SIZE=24
fi
hide_pointer() {
  sleep 8
  command -v wlrctl >/dev/null 2>&1 && wlrctl pointer move 20000 20000 2>/dev/null
  if [ -n "${DISPLAY:-}" ] && command -v xdotool >/dev/null 2>&1; then
    xdotool mousemove 20000 20000 2>/dev/null
  fi
}

# Dedicated profile so the kiosk never fights a normal browsing session.
PROFILE_DIR="${HOME}/.config/party-station-kiosk"
mkdir -p "$PROFILE_DIR"

# Ctrl+Alt+Q on the TV page asks the server to create this flag; we close
# the browser and stop relaunching. Stale flags must not block a fresh start.
STOP_FLAG="$PROFILE_DIR/stop"
rm -f "$STOP_FLAG"

while true; do
  # Clear the "Chromium didn't shut down correctly" state from hard poweroffs.
  PREFS="$PROFILE_DIR/Default/Preferences"
  if [ -f "$PREFS" ]; then
    sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' "$PREFS"
  fi
  "$BROWSER" \
    --kiosk \
    --user-data-dir="$PROFILE_DIR" \
    --no-first-run \
    --noerrdialogs \
    --disable-session-crashed-bubble \
    --disable-infobars \
    --autoplay-policy=no-user-gesture-required \
    --check-for-update-interval=31536000 \
    --ozone-platform-hint=auto \
    "$URL" &
  BROWSER_PID=$!
  hide_pointer &
  while kill -0 "$BROWSER_PID" 2>/dev/null; do
    if [ -e "$STOP_FLAG" ]; then
      kill "$BROWSER_PID" 2>/dev/null
      break
    fi
    sleep 1
  done
  wait "$BROWSER_PID" 2>/dev/null
  if [ -e "$STOP_FLAG" ]; then
    rm -f "$STOP_FLAG"
    echo "party-station-kiosk: exited via Ctrl+Alt+Q — run party-station-kiosk to relaunch." >&2
    exit 0
  fi
  sleep 2
done
