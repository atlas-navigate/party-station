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
#   5. Makes the Pi a console: boots straight into a Chromium kiosk showing the
#      TV view on the HDMI screen (desktop image required; skip with SETUP_KIOSK=0)
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

# ── TV kiosk: on by default — the Pi is a console. Skip with SETUP_KIOSK=0. ──
if [ "${SETUP_KIOSK:-1}" != "0" ]; then
  echo "==> Setting up the TV kiosk (HDMI boots straight into the console)…"
  HAS_DESKTOP=0
  for bin in labwc wayfire startlxde-pi lxsession lightdm; do
    command -v "$bin" >/dev/null 2>&1 && HAS_DESKTOP=1 && break
  done
  if [ "$HAS_DESKTOP" = 0 ]; then
    echo "    No desktop session found (Raspberry Pi OS Lite?) — kiosk skipped."
    echo "    Use the desktop image to drive the TV from the Pi, or open"
    echo "    http://party-station.local/tv on a smart TV's browser."
  else
    KIOSK_BROWSER=""
    command -v chromium-browser >/dev/null 2>&1 && KIOSK_BROWSER="chromium-browser"
    [ -z "$KIOSK_BROWSER" ] && command -v chromium >/dev/null 2>&1 && KIOSK_BROWSER="chromium"
    if [ -z "$KIOSK_BROWSER" ]; then
      apt-get install -y -qq chromium-browser >/dev/null 2>&1 || apt-get install -y -qq chromium >/dev/null 2>&1 || true
      command -v chromium-browser >/dev/null 2>&1 && KIOSK_BROWSER="chromium-browser"
      [ -z "$KIOSK_BROWSER" ] && command -v chromium >/dev/null 2>&1 && KIOSK_BROWSER="chromium"
    fi
    if [ -n "$KIOSK_BROWSER" ]; then
      # Console behavior: log straight into the desktop, never blank the TV.
      if command -v raspi-config >/dev/null 2>&1; then
        raspi-config nonint do_boot_behaviour B4 >/dev/null 2>&1 || true
        raspi-config nonint do_blanking 1 >/dev/null 2>&1 || true
      fi

      KIOSK_CMD="$APP_DIR/scripts/kiosk.sh"
      chmod +x "$KIOSK_CMD"
      HOME_DIR="$(getent passwd "$RUN_USER" | cut -d: -f6)"
      HOME_DIR="${HOME_DIR:-/home/$RUN_USER}"

      # Hook every session type Raspberry Pi OS ships; kiosk.sh holds a lock
      # so at most one instance runs even if two mechanisms fire.
      AUTOSTART_DIR="$HOME_DIR/.config/autostart"
      mkdir -p "$AUTOSTART_DIR"
      cat > "$AUTOSTART_DIR/party-station-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Party Station TV
Exec=$KIOSK_CMD
X-GNOME-Autostart-enabled=true
EOF
      chown -R "$RUN_USER":"$RUN_USER" "$AUTOSTART_DIR"

      if command -v labwc >/dev/null 2>&1; then
        LABWC_DIR="$HOME_DIR/.config/labwc"
        mkdir -p "$LABWC_DIR"
        touch "$LABWC_DIR/autostart"
        grep -qF "$KIOSK_CMD" "$LABWC_DIR/autostart" || echo "$KIOSK_CMD &" >> "$LABWC_DIR/autostart"
        chown -R "$RUN_USER":"$RUN_USER" "$LABWC_DIR"
      fi

      if command -v wayfire >/dev/null 2>&1; then
        WAYFIRE_INI="$HOME_DIR/.config/wayfire.ini"
        touch "$WAYFIRE_INI"
        if ! grep -qF "$KIOSK_CMD" "$WAYFIRE_INI"; then
          printf '\n[autostart]\nparty_station_kiosk = %s\n' "$KIOSK_CMD" >> "$WAYFIRE_INI"
        fi
        chown "$RUN_USER":"$RUN_USER" "$WAYFIRE_INI"
      fi

      echo "    Kiosk installed — the TV view opens fullscreen at next boot."
    else
      echo "    Could not find/install Chromium — skipping kiosk. Open http://localhost/tv manually."
    fi
  fi
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
cat <<EOF

✅ Party Station is up!

   Phones:      http://party-station.local   (or http://${IP})
   Big screen:  plug the Pi into the TV — it boots straight into the console
                (or open http://party-station.local/tv on a smart TV's browser)

   Updates: the station checks GitHub every 15 minutes and installs new
   versions automatically between games. You can also press "Check for
   updates" in the app's settings.

   Logs:    journalctl -u party-station -f
EOF
