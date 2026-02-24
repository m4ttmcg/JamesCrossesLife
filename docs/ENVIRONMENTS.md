# Environments

Last updated: 2026-02-24

## Branching Strategy (Recommended)

- `main`: production branch (Cloudflare Pages production deploy)
- `develop`: integration/dev branch (Cloudflare Pages preview deploys)
- feature branches: short-lived branches merged into `develop`

## Cloudflare Pages + Functions Setup

- Static site still serves from repo root (`index.html`, `style.css`, `game.js`)
- Pages Functions live in `functions/`
- Server leaderboard API route: `GET/POST /api/leaderboard`
- D1 schema file: `db/schema.sql`

## D1 Databases

- `dev` D1 DB for preview/local testing
- `prod` D1 DB for production leaderboard

Update `wrangler.toml` placeholders:

- `REPLACE_WITH_DEV_D1_DATABASE_ID`
- `REPLACE_WITH_PROD_D1_DATABASE_ID`

## Local Dev Notes

- Opening `index.html` directly still works for gameplay, but server leaderboard is disabled (no API endpoint in file mode).
- To test server leaderboard locally, run Pages dev tooling (for example `wrangler pages dev .`) with D1 binding configured.

## Deployment Notes

- Git-integrated Cloudflare Pages deploys `main` as production.
- Other branches create preview deployments automatically (good for `develop` and feature branches).
