#!/usr/bin/env bash
# Dev helper: make THIS machine answer to party-station.local on the LAN.
#
# The Pi answers to that name because setup-pi.sh renames it; a dev box
# (laptop, Jetson, …) advertises its own hostname instead, so phones can't
# find party-station.local while you test. This publishes an mDNS alias for
# the duration of the run.
#
#   scripts/dev-mdns.sh                # advertise party-station.local
#   scripts/dev-mdns.sh other.local IP # override name and/or address
#
# Runs in the foreground — Ctrl-C to stop advertising. Needs avahi-utils
# and a running avahi-daemon (sudo apt install avahi-utils avahi-daemon).
set -euo pipefail

NAME="${1:-party-station.local}"
# Default to the source address of the default route — the address other
# LAN devices can actually reach (skips docker0 and other virtual bridges).
IP="${2:-$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.*src \([0-9.]*\).*/\1/p')}"
[ -z "$IP" ] && IP="$(hostname -I | awk '{print $1}')"

if ! command -v avahi-publish >/dev/null 2>&1; then
  echo "avahi-publish not found — install it: sudo apt install avahi-utils" >&2
  exit 1
fi

echo "Advertising ${NAME} → ${IP}   (Ctrl-C to stop)"
exec avahi-publish -a -R "$NAME" "$IP"
