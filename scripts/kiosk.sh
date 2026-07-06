#!/usr/bin/env bash
# Party Station TV kiosk launcher.
#
# Started by the desktop session at login (setup-pi.sh wires it into the
# session's autostart). Waits for the game server, then runs Chromium
# fullscreen on the TV view — and relaunches it if it ever exits, so the
# TV always shows the console.
set -u

URL="${KIOSK_URL:-http://localhost/tv}"

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

# Dedicated profile so the kiosk never fights a normal browsing session.
PROFILE_DIR="${HOME}/.config/party-station-kiosk"
mkdir -p "$PROFILE_DIR"

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
    "$URL"
  sleep 2
done
