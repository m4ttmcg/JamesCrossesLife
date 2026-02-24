# James Crosses Life

A web-based Crossy Road style game where James dodges boring daily tasks (homework, sport training, chores) to reach the couch and Xbox.

## Features

- Canvas gameplay with keyboard, swipe, and on-screen D-pad controls
- Difficulty modes (`Chill`, `Classic`, `Chaos`)
- James skin selection
- Local persistent settings + leaderboard/high scores (via `localStorage`)
- Procedural SFX, background chiptune toggle, haptics toggle, fullscreen button
- Static hosting friendly (Cloudflare Pages / any static server)

## Run locally

You can open `index.html` directly, but a local static server is better for mobile testing and PWA manifest checks:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Controls

- `Swipe` on the game area (touch devices)
- `Arrow keys` or `WASD`
- On-screen touch buttons

## Deploy to Cloudflare Pages

This project is static and requires no build step.

- Framework preset: `None`
- Build command: *(leave empty)*
- Build output directory: `/` (root)

Cloudflare Pages can serve the repository directly as static files.

## Project Files

- `index.html` - UI shell and controls
- `style.css` - responsive styling
- `game.js` - game runtime and local persistence
- `manifest.webmanifest` - PWA metadata
- `assets/icon.svg` - app icon
- `assets/obstacles/` - obstacle sprite source assets + PNGs + embedded sprite bundle

## MVP Notes

- Obstacle art now uses real sprite assets, but some wide obstacle hitboxes still render as repeated sprites inside a card for clarity/simplicity.
- This is acceptable for MVP and can be refined in a later art pass.

## Future Improvements

See `docs/FUTURE_PLANS.md` for the current roadmap / remaining polish items.

## Server Leaderboard (Work In Progress)

This repo now includes the start of a Cloudflare Pages Functions + D1 server leaderboard:

- API route: `functions/api/leaderboard.js`
- D1 schema: `db/schema.sql`
- Wrangler config scaffold: `wrangler.toml`

Current behavior:

- Game uses global leaderboard when `/api/leaderboard` is available
- Falls back to local device leaderboard when server/API is unavailable
- Player name is captured in the settings overlay (no auth yet)

## Dev / Prod Branching

Recommended branch setup:

- `main` = production
- `develop` = dev/integration

See `docs/ENVIRONMENTS.md` for Cloudflare Pages + D1 environment notes.
