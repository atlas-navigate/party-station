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
  the TV (or let the kiosk do it) — the hub, lobbies, and every game render
  there in 3D (three.js, bundled locally, works fully offline).
- **Phones are controllers with a private screen.** Your hand of cards, your
  bets, your secret role — those live on your phone, Wii-U-gamepad style.
  In arcade games the phone becomes a touch gamepad.
- **Bluetooth controllers work everywhere.** Pair any standard controller
  with the Pi (see below), press any button, and you're a player. Menus for
  your turn pop up on the TV: **A** choose · **B** back · **X** start/resume ·
  **Y** peek at your hand · **Start** pause (host). One honest physics note:
  a single shared screen can't keep card hands truly secret — controller
  players "peek" their fanned hand on the TV for a few seconds, so deal
  phones to the poker sharks and pads to everyone else.
- **Bots fill seats.** Start any game solo and bots take the empty chairs.
  If someone's phone dies mid-game, the host can hand their seat to a bot —
  and anyone can take over a bot seat later.
- **Auto-save.** Turn-based games save after every move. Leave mid-game
  ("Save & exit") and a **SAVED** badge appears on the game tile; resume
  whenever — returning players are matched by name, missing ones become bots.
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
you want the Pi itself to drive the TV), get it on your network, then:

```bash
curl -fsSL https://raw.githubusercontent.com/atlas-navigate/party-station/main/scripts/setup-pi.sh | sudo bash
```

That sets the hostname to `party-station` (mDNS via avahi →
`party-station.local`), installs Node.js, installs the app under
`/opt/party-station`, starts a systemd service on port 80 — and, on the
desktop image, **turns the Pi into a console**: it auto-logs into the
desktop, disables screen blanking, and boots straight into Chromium
fullscreen on the TV view (`http://localhost/tv`). Plug the HDMI cable into
a TV and it just shows the console; the kiosk waits for the server, and
relaunches the browser if it ever exits. Don't want that (e.g. the Pi is
also your desktop machine)? Run the setup with `SETUP_KIOSK=0`:

```bash
curl -fsSL https://raw.githubusercontent.com/atlas-navigate/party-station/main/scripts/setup-pi.sh | sudo SETUP_KIOSK=0 bash
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

## The Cabinet: real retro games via RetroPie

Party Station can act as the frontend for RetroArch, so genuine classics
(the games you actually meant — NBA Jam, Mortal Kombat II, …) run on the
same console. Setup on the Pi:

```bash
sudo apt install -y git dialog unzip
cd ~ && git clone --depth=1 https://github.com/RetroPie/RetroPie-Setup.git
cd RetroPie-Setup && sudo ./retropie_setup.sh
```

In the menu: **Manage packages → Manage core packages → install `retroarch`**,
then under *Manage main packages* install the cores you want:
`lr-mame2003-plus` (arcade), `lr-snes9x`, `lr-genesis-plus-gx`,
`lr-pcsx-rearmed` (PS1), `lr-fceumm` (NES). Skip EmulationStation —
Party Station is the frontend.

Then drop ROM files for **games you legally own** into the standard folders:

```
~/RetroPie/roms/arcade/     (.zip — must match the mame2003-plus ROM set!)
~/RetroPie/roms/snes/       (.sfc/.smc)
~/RetroPie/roms/psx/        (.cue/.chd/.pbp)
~/RetroPie/roms/megadrive/  (.md/.gen/.bin)
```

Within a minute a **🕹️ Cabinet** category appears in the hub (phones and
TV). Launching a title starts RetroArch fullscreen on the Pi's HDMI output;
Bluetooth controllers work in it natively (that's their home turf). Exit
with **Select+Start** and Party Station takes the screen back — phones also
get a force-quit button just in case. No ROMs ship with this repo, and none
ever will.

Per-title honesty for a Pi 4: NBA Jam and MK2 run full speed under
`lr-mame2003-plus`; NFL Blitz's 3dfx arcade board is NOT playable under MAME
on a Pi — use the PS1 port with `lr-pcsx-rearmed` instead.

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
