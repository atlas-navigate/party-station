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
#   6. Installs RetroArch + emulator cores via RetroPie for the retro Cabinet
#      (real Pi only; skip with SETUP_RETROPIE=0; ROMs are never included)
set -euo pipefail

REPO="https://github.com/atlas-navigate/party-station.git"
APP_DIR="${APP_DIR:-/opt/party-station}"
HOSTNAME_WANTED="party-station"
RUN_USER="${SUDO_USER:-pi}"
HOME_DIR="$(getent passwd "$RUN_USER" | cut -d: -f6 || true)"
HOME_DIR="${HOME_DIR:-/home/$RUN_USER}"

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

# ── RetroPie / RetroArch (the Cabinet) — on by default on a real Pi. ──
# Skip with SETUP_RETROPIE=0. Installs RetroArch + libretro cores from
# RetroPie's binary repo (falls back to source builds). No ROMs are ever
# included — add dumps of games you own at http://party-station.local/roms.
if [ "${SETUP_RETROPIE:-1}" != "0" ] && grep -qi "raspberry pi" /proc/device-tree/model 2>/dev/null; then
  echo "==> Setting up RetroArch + emulator cores (the retro Cabinet)…"
  apt-get install -y -qq dialog unzip >/dev/null 2>&1 || true
  RP_SETUP="$HOME_DIR/RetroPie-Setup"
  if [ ! -d "$RP_SETUP/.git" ]; then
    sudo -u "$RUN_USER" git clone --depth=1 https://github.com/RetroPie/RetroPie-Setup.git "$RP_SETUP"
  else
    sudo -u "$RUN_USER" git -C "$RP_SETUP" pull --ff-only >/dev/null 2>&1 || true
  fi
  # _auto_ = binary install when RetroPie ships one for this Pi/OS, else a
  # source build (slow but unattended). Skip anything already installed.
  for pkg in retroarch lr-mame2003-plus lr-fceumm lr-snes9x lr-genesis-plus-gx lr-pcsx-rearmed; do
    if [ -d "/opt/retropie/emulators/$pkg" ] || [ -d "/opt/retropie/libretrocores/$pkg" ]; then
      echo "    $pkg — already installed"
      continue
    fi
    echo "    Installing $pkg… (binaries are quick; source builds can take a while — output below)"
    if ! "$RP_SETUP/retropie_packages.sh" "$pkg" _auto_ 2>&1 | tee "/tmp/retropie-$pkg.log"; then
      echo "    ⚠ $pkg failed (see /tmp/retropie-$pkg.log) — install later via $RP_SETUP/retropie_setup.sh"
    fi
  done
  sudo -u "$RUN_USER" mkdir -p \
    "$HOME_DIR/RetroPie/roms/arcade" "$HOME_DIR/RetroPie/roms/nes" \
    "$HOME_DIR/RetroPie/roms/snes" "$HOME_DIR/RetroPie/roms/megadrive" \
    "$HOME_DIR/RetroPie/roms/psx" "$HOME_DIR/RetroPie/roms/incoming" \
    "$HOME_DIR/RetroPie/BIOS"
  echo "    Cabinet ready. Add ROMs at http://${HOSTNAME_WANTED}.local/roms"
  echo "    (or scp them into ~/RetroPie/roms/incoming — they sort themselves)."
elif [ "${SETUP_RETROPIE:-1}" != "0" ]; then
  echo "==> Not a Raspberry Pi — skipping RetroArch/RetroPie setup."
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
cat <<EOF

✅ Party Station is up!

   Phones:      http://party-station.local   (or http://${IP})
   Big screen:  plug the Pi into the TV — it boots straight into the console
                (or open http://party-station.local/tv on a smart TV's browser)
   Retro ROMs:  upload at http://party-station.local/roms, or scp files into
                ~/RetroPie/roms/incoming — they sort into the right folder

   Updates: the station checks GitHub every 15 minutes and installs new
   versions automatically between games. You can also press "Check for
   updates" in the app's settings.

   Logs:    journalctl -u party-station -f
EOF
