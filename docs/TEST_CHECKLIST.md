# Manual Test Checklist

Last updated: 2026-02-23

## Smoke Test

- [x] Open `index.html` (or local static server) and verify page renders without missing file errors
- [x] Start a run and confirm canvas animates with moving obstacles
- [x] Reach an obstacle and confirm collision triggers lose overlay
- [x] Reach the couch row and confirm win overlay

## Input

- [x] Arrow keys move James
- [x] `WASD` moves James
- [ ] Swipe on canvas moves James on touch/pointer device
- [ ] D-pad buttons move James
- [x] `P` or `Esc` pauses/resumes

## Settings / Persistence

- [x] Change difficulty and confirm it applies to next run
- [x] Change skin and confirm player colors update
- [x] Toggle sound/music/haptics and reload page to confirm settings persist
- [x] Finish runs and confirm leaderboard entries persist after reload
- [x] Reset scores and confirm leaderboard + best/wins clear

## Device Features

- [ ] Quick mute button toggles audio state text
- [ ] Fullscreen button enters/exits fullscreen (supported browsers)
- [ ] Background tab/lock screen pauses active run

## Deploy Readiness

- [ ] `manifest.webmanifest` loads successfully
- [ ] `assets/icon.svg` loads successfully
- [ ] Cloudflare Pages serves repo as static site with no build step
