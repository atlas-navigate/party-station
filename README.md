# 🎉 Party Station

A local party-game console for a Raspberry Pi. The Pi hosts everything on your
LAN — no internet needed to play. The TV shows the shared table/board/arcade
screen, and everyone joins from their phone browser at
**http://party-station.local**. Empty seats are filled by bots, and long games
save automatically so you can pick them up next game night.

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

- **Phones are controllers.** Private hands, bets, and play calls stay on your
  phone. The TV (`/tv`) shows the shared state — tricks, boards, pots,
  fields, and the two real-time arcade games.
- **Bots fill seats.** Start any game solo and bots take the empty chairs.
  If someone's phone dies mid-game, the host can hand their seat to a bot —
  and anyone can tap "take over" to claim a bot seat later.
- **Auto-save.** Turn-based games save after every move. Leave mid-game
  ("Save & exit") and a **SAVED** badge appears on the game tile; resume
  whenever — returning players are matched by name, missing ones become bots.
- **Reconnect-proof.** Phones that lock or drop Wi-Fi re-join their seat
  automatically.

## Setup on a Raspberry Pi

Flash Raspberry Pi OS (Lite is fine for phones-only; use the desktop image if
you want the Pi itself to drive the TV), get it on your network, then:

```bash
curl -fsSL https://raw.githubusercontent.com/atlas-navigate/party-station/main/scripts/setup-pi.sh | sudo bash
```

That sets the hostname to `party-station` (mDNS via avahi →
`party-station.local`), installs Node.js, installs the app under
`/opt/party-station`, and starts a systemd service on port 80.

For the TV you have two options:
- Plug the Pi into the TV and re-run with `SETUP_KIOSK=1` — Chromium opens
  `http://localhost/tv` fullscreen on boot (desktop image required), or
- Open `http://party-station.local/tv` in any browser on a smart TV,
  Fire stick, or a laptop plugged into the TV.

> **Pi 4 (2GB) note:** the server itself is tiny. If you run the kiosk
> browser on the same Pi, keep it to the one Chromium tab — that's the
> normal setup and fits comfortably in 2GB.

Android phones resolve `.local` names in modern versions; if a device can't,
use the Pi's IP address (shown in the app's Settings sheet and in
`journalctl -u party-station`).

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
2. **Client module** — `public/js/games/<id>.js` exporting `player` and `tv`
   renderers (or a `pad` layout + canvas sim for relay games).
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
for turn-based games (phones just render `pub`/`priv` views and send
actions); the two real-time arcade games run their simulation in the TV's
browser at 60fps while the server relays phone gamepad inputs to it. State
snapshots land in `data/saves/*.json` after every action, debounced.
