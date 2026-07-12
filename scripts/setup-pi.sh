#!/usr/bin/env bash
# Party Station — one-shot setup for a Raspberry Pi or any Linux box.
#
#   curl -fsSL https://raw.githubusercontent.com/atlas-navigate/party-station/main/scripts/setup-pi.sh | sudo bash
#
# What it does:
#   1. Sets the hostname to "party-station" so the app lives at http://party-station.local
#   2. Ensures avahi (mDNS), git, and Node.js 18+ are installed
#      (supports apt, dnf, yum, pacman, and zypper based distros)
#   3. Clones the app to /opt/party-station and installs dependencies — always
#      the latest GitHub main, the exact version a live station runs (stations
#      auto-update from main)
#   4. Installs + starts a systemd service on port 80 (auto-restarts, applies updates)
#   5. Makes the box a console: boots straight into a Chromium kiosk showing the
#      TV view on the attached screen (desktop session required; skip with SETUP_KIOSK=0)
#   6. On a real Raspberry Pi only: installs RetroArch + emulator cores via
#      RetroPie for the retro Cabinet (skip with SETUP_RETROPIE=0; prebuilt
#      emulators need Raspberry Pi OS 12 "Bookworm" or older — on newer OSes
#      the cores are skipped unless RETROPIE_FROM_SOURCE=1; ROMs are never
#      included)
set -euo pipefail

# This script usually runs as `curl … | sudo bash` — nothing may ever stop to
# ask a question, or the install looks hung. Keep package tools and git
# non-interactive.
export DEBIAN_FRONTEND=noninteractive
export GIT_TERMINAL_PROMPT=0

# ── Package manager abstraction: apt (Debian/Ubuntu/Raspberry Pi OS),
#    dnf/yum (Fedora/RHEL), pacman (Arch), zypper (openSUSE). ──
PKG=""
for pm in apt-get dnf yum pacman zypper; do
  command -v "$pm" >/dev/null 2>&1 && { PKG="$pm"; break; }
done
if [ -z "$PKG" ]; then
  echo "!! No supported package manager found (apt-get, dnf, yum, pacman, zypper)."
  exit 1
fi

pkg_refresh() {
  case "$PKG" in
    apt-get) apt-get update -qq ;;
    pacman)  pacman -Sy --noconfirm >/dev/null ;;
    zypper)  zypper --non-interactive refresh >/dev/null 2>&1 || true ;;
    *)       : ;;   # dnf/yum refresh metadata on demand
  esac
}

pkg_install() {
  case "$PKG" in
    apt-get) apt-get install -y -qq \
      -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold "$@" ;;
    dnf|yum) "$PKG" install -y -q "$@" ;;
    pacman)  pacman -S --noconfirm --needed "$@" ;;
    zypper)  zypper --non-interactive install "$@" ;;
  esac
}

REPO="https://github.com/atlas-navigate/party-station.git"
APP_DIR="${APP_DIR:-/opt/party-station}"
HOSTNAME_WANTED="party-station"
RUN_USER="${RUN_USER:-${SUDO_USER:-pi}}"
HOME_DIR="$(getent passwd "$RUN_USER" | cut -d: -f6 || true)"
HOME_DIR="${HOME_DIR:-/home/$RUN_USER}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run with sudo: curl -fsSL .../setup-pi.sh | sudo bash"
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "!! This installer needs systemd (it runs Party Station as a service) — not found."
  exit 1
fi

if ! id -u "$RUN_USER" >/dev/null 2>&1; then
  echo "User \"$RUN_USER\" doesn't exist — the console needs a normal account to run as."
  echo "Run this with sudo from your regular user, or pick one: RUN_USER=<user>"
  exit 1
fi

echo "==> Installing packages (git, avahi, curl)…"
pkg_refresh
case "$PKG" in
  apt-get) pkg_install git avahi-daemon curl ca-certificates >/dev/null ;;
  *)       pkg_install git avahi curl ca-certificates >/dev/null ;;
esac
# Fedora/RHEL resolve .local names through nss-mdns; harmless if unavailable.
case "$PKG" in dnf|yum) pkg_install nss-mdns >/dev/null 2>&1 || true ;; esac

echo "==> Setting hostname to ${HOSTNAME_WANTED} (→ http://${HOSTNAME_WANTED}.local)…"
CURRENT_HOST="$(hostname)"
if [ "$CURRENT_HOST" != "$HOSTNAME_WANTED" ]; then
  # hostnamectl can be present but refuse (containers, WSL) — fall back to
  # writing /etc/hostname directly rather than aborting the install.
  if ! { command -v hostnamectl >/dev/null 2>&1 \
         && hostnamectl set-hostname "$HOSTNAME_WANTED" 2>/dev/null; }; then
    echo "$HOSTNAME_WANTED" > /etc/hostname
    hostname "$HOSTNAME_WANTED" 2>/dev/null || true
  fi
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
  case "$PKG" in
    apt-get)
      echo "    Installing Node.js 20 from NodeSource…"
      if ! curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1; then
        echo "    NodeSource doesn't cover this OS/arch — falling back to the distro's nodejs…"
      fi
      pkg_install nodejs >/dev/null
      ;;
    dnf|yum)
      echo "    Installing Node.js 20 from NodeSource…"
      if ! curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - >/dev/null 2>&1; then
        echo "    NodeSource doesn't cover this OS/arch — falling back to the distro's nodejs…"
      fi
      pkg_install nodejs >/dev/null
      ;;
    pacman)
      echo "    Installing Node.js from the Arch repos…"
      pkg_install nodejs npm >/dev/null
      ;;
    zypper)
      echo "    Installing Node.js from the openSUSE repos…"
      pkg_install nodejs22 nodejs22-npm >/dev/null 2>&1 \
        || pkg_install nodejs20 nodejs20-npm >/dev/null 2>&1 \
        || pkg_install nodejs npm >/dev/null
      ;;
  esac
  if ! command -v node >/dev/null 2>&1 \
    || [ "$(node -e 'console.log(process.versions.node.split(".")[0])')" -lt 18 ]; then
    echo "!! Couldn't get Node.js 18+ onto this system — install it manually, then re-run."
    exit 1
  fi
fi
# Some distros ship npm separately from nodejs.
command -v npm >/dev/null 2>&1 || pkg_install npm >/dev/null 2>&1 || true
if ! command -v npm >/dev/null 2>&1; then
  echo "!! Node.js is present but npm is missing — install npm, then re-run."
  exit 1
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

# Some distros (Fedora, openSUSE) ship an active firewall that would keep
# phones from reaching the station — open http and mDNS if one is running.
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  echo "==> Opening http + mDNS in firewalld…"
  firewall-cmd --permanent --add-service=http >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-service=mdns >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
elif command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "^Status: active"; then
  echo "==> Opening http + mDNS in ufw…"
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 5353/udp >/dev/null 2>&1 || true
fi

# ── TV kiosk: on by default — the box is a console. Skip with SETUP_KIOSK=0. ──
if [ "${SETUP_KIOSK:-1}" != "0" ]; then
  echo "==> Setting up the TV kiosk (the screen boots straight into the console)…"
  HAS_DESKTOP=0
  for bin in labwc wayfire startlxde-pi lxsession lightdm gdm gdm3 sddm \
             gnome-session startplasma-wayland startplasma-x11 xfce4-session \
             cinnamon-session mate-session sway; do
    command -v "$bin" >/dev/null 2>&1 && HAS_DESKTOP=1 && break
  done
  if [ "$HAS_DESKTOP" = 0 ]; then
    echo "    No desktop session found (Lite/server install?) — kiosk skipped."
    echo "    Use a desktop image to drive the TV from this box, or open"
    echo "    http://party-station.local/tv on a smart TV's browser."
  else
    KIOSK_BROWSER=""
    command -v chromium-browser >/dev/null 2>&1 && KIOSK_BROWSER="chromium-browser"
    [ -z "$KIOSK_BROWSER" ] && command -v chromium >/dev/null 2>&1 && KIOSK_BROWSER="chromium"
    if [ -z "$KIOSK_BROWSER" ]; then
      pkg_install chromium >/dev/null 2>&1 || pkg_install chromium-browser >/dev/null 2>&1 || true
      command -v chromium-browser >/dev/null 2>&1 && KIOSK_BROWSER="chromium-browser"
      [ -z "$KIOSK_BROWSER" ] && command -v chromium >/dev/null 2>&1 && KIOSK_BROWSER="chromium"
    fi
    if [ -n "$KIOSK_BROWSER" ]; then
      # Emoji glyphs for the TV UI, and pointer tools kiosk.sh uses to park
      # the mouse cursor off-screen (wlrctl on Wayland, xdotool on X11).
      # Installed one at a time: any of them may be missing on a given distro.
      case "$PKG" in
        apt-get) EMOJI_PKGS="fonts-noto-color-emoji" ;;
        dnf|yum) EMOJI_PKGS="google-noto-color-emoji-fonts google-noto-emoji-color-fonts" ;;
        pacman)  EMOJI_PKGS="noto-fonts-emoji" ;;
        zypper)  EMOJI_PKGS="noto-coloremoji-fonts" ;;
      esac
      for p in $EMOJI_PKGS wlrctl xdotool; do
        pkg_install "$p" >/dev/null 2>&1 || true
      done

      # Console behavior: log straight into the desktop, never blank the TV.
      if command -v raspi-config >/dev/null 2>&1; then
        raspi-config nonint do_boot_behaviour B4 >/dev/null 2>&1 || true
        raspi-config nonint do_blanking 1 >/dev/null 2>&1 || true
        raspi-config nonint do_boot_splash 1 >/dev/null 2>&1 || true
      fi

      # Faster Pi boot to the console: skip the firmware rainbow splash and
      # its default 1s boot delay. (Pi only; idempotent.)
      if grep -qi "raspberry pi" /proc/device-tree/model 2>/dev/null; then
        BOOTCFG=""
        for f in /boot/firmware/config.txt /boot/config.txt; do
          [ -f "$f" ] && { BOOTCFG="$f"; break; }
        done
        if [ -n "$BOOTCFG" ]; then
          grep -q '^disable_splash=' "$BOOTCFG" || echo 'disable_splash=1' >> "$BOOTCFG"
          grep -q '^boot_delay=' "$BOOTCFG" || echo 'boot_delay=0' >> "$BOOTCFG"
        fi
      fi

      KIOSK_CMD="$APP_DIR/scripts/kiosk.sh"
      chmod +x "$KIOSK_CMD"

      # Terminal command to re-enter the console after a Ctrl+Alt+Q exit
      # (works from the desktop, a virtual terminal, or SSH).
      cat > /usr/local/bin/party-station-kiosk <<EOF
#!/usr/bin/env bash
# Relaunch the Party Station TV kiosk (exit it with Ctrl+Alt+Q on the TV).
[ "\$(id -u)" = "0" ] && exec sudo -u ${RUN_USER} "$KIOSK_CMD" "\$@"
exec "$KIOSK_CMD" "\$@"
EOF
      chmod +x /usr/local/bin/party-station-kiosk

      # Hook every session type the box might have (XDG autostart covers
      # GNOME, KDE, LXDE, XFCE, …); kiosk.sh holds a lock so at most one
      # instance runs even if two mechanisms fire.
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
# Skip with SETUP_RETROPIE=0. RetroPie only ships prebuilt emulators for
# Raspberry Pi OS 10/11 (32-bit) and 12 "Bookworm"; on newer OS releases
# everything compiles from source, which takes HOURS on a Pi and looks like
# a hang — so that path is opt-in via RETROPIE_FROM_SOURCE=1. No ROMs are
# ever included — add dumps of games you own at http://party-station.local/roms.
if [ "${SETUP_RETROPIE:-1}" != "0" ] && grep -qi "raspberry pi" /proc/device-tree/model 2>/dev/null; then
  DEBIAN_VER="$(. /etc/os-release && echo "${VERSION_ID:-0}")"
  ARCH="$(dpkg --print-architecture)"
  HAS_BINARIES=0   # mirrors RetroPie-Setup's own rule (scriptmodules/system.sh)
  case "$DEBIAN_VER" in
    10|11) [ "$ARCH" = "armhf" ] && HAS_BINARIES=1 ;;
    12)    HAS_BINARIES=1 ;;
  esac
  if [ "$HAS_BINARIES" = 0 ] && [ "${RETROPIE_FROM_SOURCE:-0}" != "1" ]; then
    cat <<EOF
==> Skipping the retro Cabinet: RetroPie has no prebuilt emulators for this
    OS (Debian ${DEBIAN_VER}, ${ARCH}), and compiling them on a Pi takes hours.
    The party games work regardless. To get the Cabinet, either:
      • flash "Raspberry Pi OS (Legacy, Bookworm)" and re-run this script, or
      • accept the multi-hour source build by re-running with:
          curl -fsSL https://raw.githubusercontent.com/atlas-navigate/party-station/main/scripts/setup-pi.sh | sudo RETROPIE_FROM_SOURCE=1 bash
EOF
  else
    echo "==> Setting up RetroArch + emulator cores (the retro Cabinet)…"
    if [ "$HAS_BINARIES" = 0 ]; then
      echo "    No prebuilt emulators for this OS — compiling from source."
      echo "    This takes HOURS on a Pi; leave it running (build output streams below)."
    fi
    pkg_install dialog unzip >/dev/null 2>&1 || true
    RP_SETUP="$HOME_DIR/RetroPie-Setup"
    if [ ! -d "$RP_SETUP/.git" ]; then
      sudo -u "$RUN_USER" env GIT_TERMINAL_PROMPT=0 git clone --depth=1 https://github.com/RetroPie/RetroPie-Setup.git "$RP_SETUP"
    else
      sudo -u "$RUN_USER" env GIT_TERMINAL_PROMPT=0 git -C "$RP_SETUP" pull --ff-only >/dev/null 2>&1 || true
    fi
    # _auto_ = binary install when RetroPie ships one for this Pi/OS, else a
    # source build. Skip anything already installed. lr-mame2003-plus goes
    # last — it is by far the longest build when compiling from source.
    # </dev/null: our stdin is the curl pipe; a child must never read it.
    for pkg in retroarch lr-fceumm lr-snes9x lr-genesis-plus-gx lr-gambatte lr-mgba lr-pcsx-rearmed \
               lr-mupen64plus-next lr-stella2014 lr-beetle-pce-fast lr-ppsspp lr-mame2003-plus; do
      if [ -d "/opt/retropie/emulators/$pkg" ] || [ -d "/opt/retropie/libretrocores/$pkg" ]; then
        echo "    $pkg — already installed"
        continue
      fi
      echo "    Installing $pkg… (binaries take a minute or two; source builds run long — output below)"
      if ! "$RP_SETUP/retropie_packages.sh" "$pkg" _auto_ </dev/null 2>&1 | tee "/tmp/retropie-$pkg.log"; then
        echo "    ⚠ $pkg failed (see /tmp/retropie-$pkg.log) — install later via $RP_SETUP/retropie_setup.sh"
      fi
    done
    # Controller profiles: RetroPie normally maps pads via EmulationStation's
    # config wizard, which Party Station doesn't use — so without these,
    # RetroArch greets controllers with "not configured" and games ignore
    # them. Install the community autoconfig pack (8BitDo, Xbox, PlayStation,
    # …) into both places RetroArch might look, never overwriting profiles
    # the user saved themselves.
    echo "    Installing controller autoconfig profiles…"
    JOY_TMP="$(mktemp -d)"
    if env GIT_TERMINAL_PROMPT=0 git clone --depth=1 \
         https://github.com/libretro/retroarch-joypad-autoconfig "$JOY_TMP" >/dev/null 2>&1; then
      mkdir -p /opt/retropie/configs/all/retroarch-joypads
      cp -n "$JOY_TMP"/udev/*.cfg /opt/retropie/configs/all/retroarch-joypads/ 2>/dev/null || true
      chown -R "$RUN_USER":"$RUN_USER" /opt/retropie/configs/all/retroarch-joypads
      sudo -u "$RUN_USER" mkdir -p "$HOME_DIR/.config/retroarch/autoconfig/udev"
      cp -n "$JOY_TMP"/udev/*.cfg "$HOME_DIR/.config/retroarch/autoconfig/udev/" 2>/dev/null || true
      chown -R "$RUN_USER":"$RUN_USER" "$HOME_DIR/.config/retroarch/autoconfig"
      echo "    $(ls "$JOY_TMP"/udev/*.cfg | wc -l) pad profiles installed."
    else
      echo "    ⚠ Could not fetch pad profiles (offline?) — map pads once in the"
      echo "      RetroArch menu instead: F1 → Settings → Input → Port 1 Controls."
    fi
    rm -rf "$JOY_TMP"

    sudo -u "$RUN_USER" mkdir -p \
      "$HOME_DIR/RetroPie/roms/arcade" "$HOME_DIR/RetroPie/roms/nes" \
      "$HOME_DIR/RetroPie/roms/snes" "$HOME_DIR/RetroPie/roms/megadrive" \
      "$HOME_DIR/RetroPie/roms/mastersystem" "$HOME_DIR/RetroPie/roms/gamegear" \
      "$HOME_DIR/RetroPie/roms/gb" "$HOME_DIR/RetroPie/roms/gbc" \
      "$HOME_DIR/RetroPie/roms/gba" "$HOME_DIR/RetroPie/roms/n64" \
      "$HOME_DIR/RetroPie/roms/atari2600" "$HOME_DIR/RetroPie/roms/pcengine" \
      "$HOME_DIR/RetroPie/roms/psx" "$HOME_DIR/RetroPie/roms/incoming" \
      "$HOME_DIR/RetroPie/BIOS"
    echo "    Cabinet ready. Add ROMs at http://${HOSTNAME_WANTED}.local/roms"
    echo "    (or scp them into ~/RetroPie/roms/incoming — they sort themselves)."
  fi
elif [ "${SETUP_RETROPIE:-1}" != "0" ]; then
  echo "==> Not a Raspberry Pi — skipping RetroArch/RetroPie setup (the party"
  echo "    games all work; only the retro Cabinet needs a Pi)."
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -n "$IP" ] || IP="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n1)"
cat <<EOF

✅ Party Station is up!

   Phones:      http://party-station.local   (or http://${IP})
   Big screen:  plug this box into the TV — it boots straight into the console
                (or open http://party-station.local/tv on a smart TV's browser)
   Retro ROMs:  upload at http://party-station.local/roms, or scp files into
                ~/RetroPie/roms/incoming — they sort into the right folder

   Updates: the station checks GitHub every 15 minutes and installs new
   versions automatically between games. You can also press "Check for
   updates" in the app's settings.

   Logs:    journalctl -u party-station -f
EOF
