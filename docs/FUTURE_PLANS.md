# Future Plans

Last updated: 2026-02-23

## MVP Gaps (Known)

- Obstacle cards can look visually rough when a wide hitbox repeats multiple sprite icons.
- Touch-specific controls/features are only partially tested on real devices.
- Fullscreen / quick mute / manifest behavior still needs cross-browser validation.

## Next Improvements

- Replace repeated sprite tiles on wide obstacles with cleaner art compositions:
  - single large object variants
  - paired object layouts
  - lane-specific sprite packs
- Add stronger art direction consistency (pixel-art or flat-cartoon pass across all sprites).
- Add hit / win / loss screen polish animations and better feedback timing.
- Add a lightweight sprite-atlas pipeline instead of generated embedded `sprites.js`.
- Add browser smoke tests (Playwright) for basic load/start/pause/persist flows.

## Deployment Follow-Up

- Confirm Cloudflare Pages static deploy works from a fresh repo push.
- Add PNG PWA icons for additional platform sizes if install experience matters.
