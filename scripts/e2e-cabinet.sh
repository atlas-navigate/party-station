#!/usr/bin/env bash
# Runs the full e2e suite with a fabricated RetroArch setup so the Cabinet
# checks (emulator launch/kill, ROM upload routing, incoming-folder sorting)
# execute on machines without RetroPie. Usage: npm run e2e:cabinet
set -euo pipefail

PORT="${PORT:-8091}"
TMP="$(mktemp -d)"
trap 'kill $SERVER_PID 2>/dev/null; rm -rf "$TMP"' EXIT

# Fake RetroArch: a script that just waits until it is killed.
cat > "$TMP/retroarch" <<'EOF'
#!/usr/bin/env bash
trap 'exit 0' TERM INT
sleep 600
EOF
chmod +x "$TMP/retroarch"

# Fake core + one arcade ROM so the Cabinet shows up as available.
mkdir -p "$TMP/cores" "$TMP/roms/arcade"
touch "$TMP/cores/mame2003_plus_libretro.so"
echo fake > "$TMP/roms/arcade/testgame.zip"

env PORT="$PORT" ROMS_DIR="$TMP/roms" LIBRETRO_DIR="$TMP/cores" \
  RETROARCH_BIN="$TMP/retroarch" ROM_SORT_INTERVAL=250 \
  node server/index.js & SERVER_PID=$!

for _ in $(seq 1 50); do
  curl -fsS -o /dev/null "http://127.0.0.1:$PORT/api/status" 2>/dev/null && break
  sleep 0.2
done

PORT="$PORT" ROMS_DIR="$TMP/roms" node scripts/e2e.js
