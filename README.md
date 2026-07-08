# 🎉 Party Station

A game **console** built on a Raspberry Pi. The Pi renders every game in 3D on
the TV — dealt cards on a felt table, a property board with rolling dice and
little houses, a hex island, arcade courts and arenas — and players control it
with **phones** (browser at **http://party-station.local**) or **Bluetooth
controllers** paired to the Pi. Everything runs on your LAN; no internet
needed to play. Empty seats are filled by bots, and long games save
automatically so you can pick them up next game night.

## The games

| Category | Games |
| --- | --- |
| 🃏 Cards | Hearts · Crazy 8s · Texas Hold'em · Blackjack · Go Fish |
| 🎲 Board | Tycoon Trail (property trading) · Milestones (life path) · Candy Dash (color race) · Islanders (island settlement) |
| 🕹️ Arcade | Slam City (2v2 hoops) · Combat Legends (1v1 fighter) · Incognito (word impostor) · Gridiron Rush (play-calling football) |

The board and arcade titles are **original games** built for Party Station.
They're genre tributes — not copies of any commercial game — so the whole
repo is safe to share and host.

## How it plays

- **The TV is the console screen.** Open `http://party-station.local/tv` on
  the TV (or let the kiosk do it). It lands on a chooser — **🃏 Party Games
  or 🕹️ Retro Games** — then the hub, lobbies, and every game render there
  in 3D (three.js, bundled locally, works fully offline).
- **Phones are controllers with a private screen.** Your hand of cards, your
  bets, your secret role — those live on your phone, Wii-U-gamepad style.
  In arcade games the phone becomes a touch gamepad.
- **Bluetooth controllers work everywhere.** Pair any standard controller
  with the Pi (see below), press any button, and you're a player. Menus for
  your turn pop up on the TV: **A** choose · **B** back · **X** start/resume ·
  **Y** peek at your hand · **Start** pause / exit. One honest physics note:
  a single shared screen can't keep card hands truly secret — controller
  players "peek" their fanned hand on the TV for a few seconds, so deal
  phones to the poker sharks and pads to everyone else.
- **Bots fill seats.** Start any game solo and bots take the empty chairs.
  If someone's phone dies mid-game, the host can hand their seat to a bot —
  and anyone can take over a bot seat later.
- **Auto-save.** Turn-based games save after every move. Leave mid-game
  and a **SAVED** badge appears on the game tile; resume whenever —
  returning players are matched by name, missing ones become bots.
- **Every game can be exited mid-play, from any player's device.** On a
  phone: the **💾 Exit** button (turn-based) or the **✕** on the touch
  gamepad (arcade). On a controller: **Start** opens the pause menu with
  **Save & exit** (turn-based) or **End game** (arcade). Turn-based exits
  auto-save; arcade matches just end.
- **Reconnect-proof.** Phones that lock or drop Wi-Fi re-join their seat
  automatically; controller players survive a TV reload.

## Pairing a Bluetooth controller

On Raspberry Pi OS desktop: taskbar Bluetooth icon → *Add Device* → put the
controller in pairing mode → select it. Headless/CLI:

```bash
bluetoothctl
scan on          # put the controller in pairing mode, wait for its MAC
pair XX:XX:XX:XX:XX:XX
trust XX:XX:XX:XX:XX:XX
connect XX:XX:XX:XX:XX:XX
```

Chromium's Gamepad API picks it up from there — press any button on the hub
screen to join. Xbox, PlayStation, 8BitDo, and most generic "standard
mapping" pads work.

## Setup on a Raspberry Pi

Flash Raspberry Pi OS (Lite is fine for phones-only; use the desktop image if
you want the Pi itself to drive the TV — and the **Legacy/Bookworm** variant
if you want the retro Cabinet, see the note below), get it on your network,
then:

```bash
curl -fsSL https://raw.githubusercontent.com/atlas-navigate/party-station/main/scripts/setup-pi.sh | sudo bash
```

That one command sets up the whole console, no menus to click through:

- hostname `party-station` (mDNS via avahi → `party-station.local`),
  Node.js, the app under `/opt/party-station`, a systemd service on port 80;
- on the desktop image, the **TV kiosk**: auto-login, no screen blanking,
  Chromium fullscreen on the TV view at boot. Plug the HDMI cable into a TV
  and it shows the console; the kiosk waits for the server and relaunches
  the browser if it ever exits. The TV opens on a chooser — **🃏 Party
  Games or 🕹️ Retro Games** — navigable from a controller;
- **RetroArch + emulator cores** (arcade, NES, SNES, Genesis, PS1) via
  RetroPie's binary packages, so retro ROMs play out of the box. ROMs are
  **never** included — add dumps of games you own afterwards (next section).

> **Retro Cabinet needs Bookworm:** RetroPie only ships prebuilt emulators
> for Raspberry Pi OS 12 (Bookworm) and older — in the Raspberry Pi Imager
> pick **Raspberry Pi OS (Legacy, Bookworm)**. On newer images (Debian 13
> "Trixie"+) the script **skips the emulators** instead of silently
> compiling them for hours; opt in to the long source build with
> `curl … | sudo RETROPIE_FROM_SOURCE=1 bash` if you'd rather wait than
> re-flash. The party games themselves run on any image.

Opt out of pieces with env vars — e.g. the Pi is also your desktop machine,
or you don't want emulators:

```bash
curl -fsSL https://raw.githubusercontent.com/atlas-navigate/party-station/main/scripts/setup-pi.sh | sudo SETUP_KIOSK=0 SETUP_RETROPIE=0 bash
```

On Raspberry Pi OS **Lite** there's no browser to run, so the kiosk is
skipped — open `http://party-station.local/tv` in any browser on a smart
TV, Fire stick, or a laptop plugged into the TV instead.

> **Pi 4 (2GB) note:** the server itself is tiny, and the 3D scenes are tuned
> for the Pi's GPU (low-poly procedural assets, pixel ratio 1, scenes only
> re-render when something changes). Keep the kiosk to its one Chromium tab —
> that's the normal setup and fits in 2GB. If a TV browser has no WebGL at
> all, the screen degrades to a text notice while play continues on phones.

Android phones resolve `.local` names in modern versions; if a device can't,
use the Pi's IP address (shown in the app's Settings sheet and in
`journalctl -u party-station`).

## Troubleshooting from a keyboard

Plug any keyboard into the Pi:

- **Ctrl+Alt+Q** — exit the console: the kiosk closes Chromium and *stays*
  closed (no auto-relaunch), leaving you on the Pi desktop. Get the console
  back by typing `party-station-kiosk` in any terminal — it also works over
  SSH or from a virtual terminal (it finds the TV session itself).
- **Ctrl+Alt+R** — reload the TV page in place (handy after an update or if
  a scene wedges).
- **Ctrl+Alt+F1…F6** — standard Linux virtual terminals still work for a
  login shell *without* leaving the kiosk; switch back to the desktop's VT
  to return to the console.

The game server itself is a systemd service, so from that terminal the
usual tools apply: `journalctl -u party-station -f` for logs,
`sudo systemctl restart party-station` to bounce it.

## Retro games: adding ROMs

The setup script already installed RetroArch and the cores (arcade/MAME,
NES, SNES, Genesis, PS1) — Party Station is the frontend, no
EmulationStation needed. What it can't do is supply games: **no ROMs ship
with this repo, and none ever will.** Add dumps of games you legally own,
whichever way is easiest:

- **Browser (easiest):** open `http://party-station.local/roms` from any
  laptop or phone and drag files in. Each file is routed to the right
  system folder by its extension (`.sfc` → SNES, `.zip` → arcade, `.chd` →
  PS1, …), with an override dropdown for the ambiguous ones.
- **scp, one folder for everything:** copy files into
  `~/RetroPie/roms/incoming/` — the station watches it, waits for the
  transfer to finish, and sorts each file into place (it even keeps PS1
  `.cue`/`.bin` pairs together):

  ```bash
  scp *.zip *.sfc pi@party-station.local:RetroPie/roms/incoming/
  ```
- **Manually:** the classic `~/RetroPie/roms/<system>/` folders still work.

Either way the games appear under **🕹️ Retro Games** on the TV and phones
within a moment — no restart. Launching one starts RetroArch fullscreen on
the Pi's HDMI output; Bluetooth controllers work in it natively (that's
their home turf). Exit with **Select+Start** and Party Station takes the
screen back — phones also get a force-quit button just in case.

Fine print: arcade `.zip`s must match the MAME 2003-Plus (0.78) ROM set;
PS1 games may need a BIOS file in `~/RetroPie/BIOS`. Per-title honesty for
a Pi 4: NBA Jam and MK2 run full speed under `lr-mame2003-plus`; NFL
Blitz's 3dfx arcade board is NOT playable under MAME on a Pi — use the PS1
port with `lr-pcsx-rearmed` instead. Want more systems (N64, GBA)? Install
extra cores via `~/RetroPie-Setup/retropie_setup.sh`.

## Deploying updates

The station updates itself from this repo:

- Every 15 minutes it runs `git fetch`; when `origin/main` is ahead **and
  nobody is mid-game**, it pulls, reinstalls dependencies, and restarts.
- You can also trigger it manually: phone → ⚙️ Settings → **Install update
  now**.

So the release process is just: merge/push to `main` on GitHub, and every
Party Station on the planet (well, in your house) picks it up.

## Adding a game

1. **Server engine** — `server/games/<category>/<id>.js` exporting:
   - `meta` — id, name, icon, category, min/max players, `mode: 'server'`
     (turn-based, engine runs on the Pi) or `'relay'` (real-time, sim runs in
     the TV browser and phones stream inputs), plus lobby `options`.
   - for `server` games: `create({seats, options})` / `restore(ctx, state)`
     returning `{ state, pub(), priv(seat), act(seat, action), botAct(seat),
     awaiting(), over() }`. Keep `state` JSON-serializable — that's what gets
     auto-saved.
2. **Client module** — `public/js/games/<id>.js` exporting:
   - `player` — the phone controller view (touch UI + private info),
   - `tv` — `mount(holder, ctx) → { update(ctx), dispose(), rehome(el) }`
     building the 3D scene from `public/js/three-app/` helpers (or
     `start(holder, ctx)` for real-time relay sims),
   - `padChoices(ctx, stage)` — the controller menu for each decision, which
     is what makes the game playable with a Bluetooth pad.
3. Register it in `server/registry.js`.
4. Prove it: `npm run simulate <id> 50` runs bot-vs-bot games to completion
   and fails on stalls, illegal bot moves, or broken save/restore.

## Development

```bash
npm install
npm start            # http://localhost:8080 (and /tv)
npm run simulate     # bot-vs-bot integrity check for every turn-based game
PORT=8090 node server/index.js &   # then, in another shell:
PORT=8090 npm run e2e              # full websocket join/play/save/resume test
```

Only the Pi answers to `party-station.local` (setup renames it); a dev box
advertises its own hostname, so the server banner prints the name that will
actually resolve (e.g. `http://<your-host>.local:8080`). To test with the
real console name from phones, alias it while the server runs:

```bash
npm run mdns         # advertises party-station.local → this machine (Ctrl-C to stop)
```

Plain Node + `express` + `ws` on the server, vanilla ES modules in the
browser, no build step. `server/lobby.js` is the heart: one lobby/session at a
time, seat management, bot scheduling, saves, reconnects.

## Architecture in one breath

Phones and the TV hold a WebSocket to the Pi. The server owns all game state
for turn-based games; the TV renders it in 3D and phones render private
views + controls. Bluetooth controllers are read by the TV via the Gamepad
API and act through server-side "pad player" records that live on the TV's
connection — so pads and phones are interchangeable seats. The two real-time
arcade games run their simulation in the TV's browser at 60fps (phone inputs
relayed over the socket, pads polled locally). State snapshots land in
`data/saves/*.json` after every action, debounced.
