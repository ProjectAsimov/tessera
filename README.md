# Tessera

One tile per day for anything you do daily. Installable PWA with
Google sign-in and cross-device sync.

- `app/` — Vite + TypeScript + Preact frontend, deployed to GitHub Pages by
  `.github/workflows/pages.yml`. `npm run dev:mock` runs it against an
  in-memory API; `npm run dev` against `VITE_API_URL`.
- `worker/` — Cloudflare Worker (D1 + KV) for sign-in and sync. See
  `worker/README.md`.
- `docs/ARCHITECTURE.md` — object model, API contract, sync rules.
