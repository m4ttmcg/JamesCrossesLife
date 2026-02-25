# Task Tracker

Last updated: 2026-02-23

## Goal

Finish the missing game implementation and ship a complete static "James Crosses Life" package.

## Tasks

- [x] Audit current repo contents vs docs and identify missing runtime/assets
- [x] Recreate `game.js` gameplay runtime (canvas, collision, win/lose loop)
- [x] Wire controls (keyboard, swipe, D-pad) and UI overlays/buttons
- [x] Add persistence (settings, leaderboard, best score, wins)
- [x] Add audio features (SFX, music toggle, quick mute), haptics, fullscreen
- [x] Add `manifest.webmanifest` and `assets/icon.svg`
- [x] Update docs (`README.md`, `docs/STATUS.md`, `docs/DEVLOG.md`) to match current state
- [x] Add manual test checklist (`docs/TEST_CHECKLIST.md`)
- [x] Run local verification checks (file presence + JS syntax)
- [x] Gameplay balance polish pass (speed/density/spacing tuning)
- [x] Add PNG icon set variants and manifest references
- [x] Final verification pass before commit
- [x] Create initial git commit
- [x] Obstacle icon variety pass (homework/training/chores use different motifs)
- [x] Animate James movement (hop/stride between tiles)
- [x] Add custom dramatic game-over stinger (not exact copyrighted GTA asset)
- [x] Replace abstract obstacle glyphs with local SVG sprite assets (`assets/obstacles/*.svg`)
- [x] Add PNG + embedded data-URI sprite fallback for reliable local canvas rendering
- [x] Add repo roadmap notes for post-MVP polish (`docs/FUTURE_PLANS.md`)
- [x] Server leaderboard backend scaffold: Cloudflare Pages Functions + D1 top-30 endpoint/schema
- [x] Client integration started: player name + remote leaderboard fetch/submit with local fallback
- [x] Dev/prod branch/environment docs + Wrangler config scaffold (`docs/ENVIRONMENTS.md`, `wrangler.toml`)
- [ ] End-to-end validation on Cloudflare Pages + D1 (dev and prod environments)
- [ ] Remote leaderboard UX polish (wide-card visual cleanup + local/global presentation refinement)
- [x] Server-side player-name content filtering (starter blocklist + normalized matching)
- [ ] Expand/curate profanity/slur list source and moderation policy before wider release

## Notes

- `docs/STATUS.md` claimed a `game.js` prototype existed, but the file was missing in this checkout.
- `index.html` already includes a polished UI shell and references `game.js`, `manifest.webmanifest`, and `assets/icon.svg`.
