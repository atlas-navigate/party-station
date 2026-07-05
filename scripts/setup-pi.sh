#!/usr/bin/env bash
# Party Station — one-shot Raspberry Pi setup.
#
#   curl -fsSL https://raw.githubusercontent.com/atlas-navigate/party-station/main/scripts/setup-pi.sh | sudo bash
#
# What it does:
#   1. Sets the hostname to "party-station" so the app lives at http://party-station.local
#   2. Ensures avahi (mDNS), git, and Node.js 20+ are installed
#   3. Clones the app to /opt/party-station and installs dependencies
#   4. Installs + starts a systemd service on port 80 (auto-restarts, applies updates)
#   5. Optionally sets up a Chromium kiosk that opens the TV screen on boot
#      (run with SETUP_KIOSK=1 to enable)
set -euo pipefail

REPO="https://github.com/atlas-navigate/party-station.git"
APP_DIR="${APP_DIR:-/opt/party-station}"
HOSTNAME_WANTED="party-station"
RUN_USER="${SUDO_USER:-pi}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run with sudo: curl -fsSL .../setup-pi.sh | sudo bash"
  exit 1
fi

echo "==> Installing packages (git, avahi, curl)…"
apt-get update -qq
apt-get install -y -qq git avahi-daemon curl ca-certificates >/dev/null

echo "==> Setting hostname to ${HOSTNAME_WANTED} (→ http://${HOSTNAME_WANTED}.local)…"
CURRENT_HOST="$(hostname)"
if [ "$CURRENT_HOST" != "$HOSTNAME_WANTED" ]; then
  hostnamectl set-hostname "$HOSTNAME_WANTED"
  if grep -q "127.0.1.1" /etc/hosts; then
    sed -i "s/^127\.0\.1\.1.*/127.0.1.1\t${HOSTNAME_WANTED}/" /etc/hosts
  else
    echo -e "127.0.1.1\t${HOSTNAME_WANTED}" >> /etc/hosts
  fi
fi
systemctl enable --now avahi-daemon >/dev/null 2>&1 || true

echo "==> Checking Node.js…"
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  MAJOR="$(node -e 'console.log(process.versions.node.split(".")[0])')"
  [ "$MAJOR" -ge 18 ] && NEED_NODE=0
fi
if [ "$NEED_NODE" = 1 ]; then
  echo "    Installing Node.js 20 from NodeSource…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "    Node $(node --version)"

echo "==> Fetching Party Station into ${APP_DIR}…"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin main
  git -C "$APP_DIR" reset --hard origin/main
else
  git clone --depth 20 "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"
npm install --omit=dev --no-audit --no-fund >/dev/null
chown -R "$RUN_USER":"$RUN_USER" "$APP_DIR"

echo "==> Installing systemd service…"
sed -e "s|__USER__|${RUN_USER}|" -e "s|__APP_DIR__|${APP_DIR}|" \
  "$APP_DIR/systemd/party-station.service" > /etc/systemd/system/party-station.service
systemctl daemon-reload
systemctl enable --now party-station
sleep 2
systemctl --no-pager --lines=0 status party-station || true

if [ -n "${SETUP_KIOSK:-}" ]; then
  echo "==> Setting up TV kiosk autostart for user ${RUN_USER}…"
  KIOSK_BROWSER=""
  command -v chromium-browser >/dev/null 2>&1 && KIOSK_BROWSER="chromium-browser"
  [ -z "$KIOSK_BROWSER" ] && command -v chromium >/dev/null 2>&1 && KIOSK_BROWSER="chromium"
  if [ -z "$KIOSK_BROWSER" ]; then
    apt-get install -y -qq chromium-browser >/dev/null 2>&1 || apt-get install -y -qq chromium >/dev/null 2>&1 || true
    command -v chromium-browser >/dev/null 2>&1 && KIOSK_BROWSER="chromium-browser"
    [ -z "$KIOSK_BROWSER" ] && command -v chromium >/dev/null 2>&1 && KIOSK_BROWSER="chromium"
  fi
  if [ -n "$KIOSK_BROWSER" ]; then
    AUTOSTART_DIR="/home/${RUN_USER}/.config/autostart"
    mkdir -p "$AUTOSTART_DIR"
    cat > "$AUTOSTART_DIR/party-station-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Party Station TV
Exec=${KIOSK_BROWSER} --kiosk --noerrdialogs --disable-session-crashed-bubble --autoplay-policy=no-user-gesture-required http://localhost/tv
X-GNOME-Autostart-enabled=true
EOF
    chown -R "$RUN_USER":"$RUN_USER" "/home/${RUN_USER}/.config"
    echo "    Kiosk will open the TV screen at next boot (desktop session required)."
  else
    echo "    Could not find/install Chromium — skipping kiosk. Open http://localhost/tv manually."
  fi
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
cat <<EOF

✅ Party Station is up!

   Phones:      http://party-station.local   (or http://${IP})
   Big screen:  http://party-station.local/tv on the TV's browser
                (re-run with SETUP_KIOSK=1 to auto-open it on boot)

   Updates: the station checks GitHub every 15 minutes and installs new
   versions automatically between games. You can also press "Check for
   updates" in the app's settings.

   Logs:    journalctl -u party-station -f
EOF
