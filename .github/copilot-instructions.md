# Copilot Instructions — mtg-front-new

Short, actionable guidance for AI coding agents working in this repository.

## Quick overview
- Frontend: React + Vite app (`src/`), uses Tailwind, Framer Motion and `@supabase/supabase-js` to query Supabase tables.
- Backend: simple ETL script (`backend/etl_script.py`) that fetches data from 17lands and writes to Supabase REST endpoints.
- Data store: Supabase tables used by the app: `card_stats` and `archetype_stats` (lookups in `src/App.jsx`).
- Env: Root `.env` defines `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY`; backend will also accept `SUPABASE_URL` / `SUPABASE_KEY`.

## How to run & dev workflows (concrete)
- Install frontend deps: `npm install` (uses `package.json`).
- Start dev server: `npm run dev` (Vite, live reload).
- Build: `npm run build`.
- Preview build: `npm run preview`.
- Lint: `npm run lint` (ESLint configured in `eslint.config.js`).
- Run ETL (backend):
  - Ensure Python 3.10+ virtualenv and packages installed (script uses `requests` and `python-dotenv`).
  - From repo root: `python backend/etl_script.py` (it will load `.env` from repo root by default).

Example: the frontend queries `card_stats` and `archetype_stats` for set `TLA` (see `src/App.jsx`). The ETL writes to the REST endpoints
`{SUPABASE_URL}/rest/v1/card_stats` and `.../archetype_stats` with `on_conflict` params set in the script.

## Important conventions & patterns (do not change lightly)
- Colors are encoded as WUBRG letters and order should be treated order-insensitively. Use `areColorsEqual()` and `extractColors()` patterns from `src/App.jsx` when matching colors.
- "Splash" decks are encoded with `" + Splash"` suffix (ETL clean-up in `clean_color_code`).
- GIH (global improvement heuristic / ever_drawn_win_rate): ETL converts `ever_drawn_win_rate` into a percentage and stores it in `gih_wr` (see `get_gih_strict` and `safe_float`). Avoid sending NaN/Inf to Supabase — use `safe_float`.
- ETL chunking: `card_stats` are posted in chunks of 500 to avoid large requests.
- `archetype_stats` uses `on_conflict=set_code,colors,format` (unique keys) and `card_stats` uses `on_conflict=set_code,card_name,filter_context,format`.
- Frontend logic expects a special archetype name `All Decks` to compute global mean deck WR (see query at ~line 613 in `src/App.jsx`).
- Comments and some names are in French; prefer to follow existing language for new variables close to the same code area.

## Integration points & common debugging steps
- Supabase: credentials are read from `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` on the frontend, and the ETL checks for `SUPABASE_URL` / `SUPABASE_KEY` or falls back to `VITE_*` env vars.
- ETL uses 17lands public endpoints (search URLs constructed in `backend/etl_script.py`). If API responds with 429, the script waits; inspect printed responses for 4xx/5xx errors — the script prints `resp.text` on POST failures.
- If Supabase rejects payloads (400), check for NaN/Inf values in numeric fields — the script already uses `safe_float` and fallbacks, but adding logging around `resp.text` is the fastest way to see schema mismatch errors.

## Files to read for examples / patterns
- `src/App.jsx` — primary frontend business logic; examples of Supabase queries and color / rarity normalization.
- `src/supabase.js` — client instantiation; ensures `VITE_` env usage.
- `backend/etl_script.py` — ingestion logic, transformations, chunking, and how REST writes are performed.
- `.env` — stores `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` used in dev.

## Recommendations for AI agents (what to do & what not to do)
- Do:
  - Use existing helper functions and constants (`areColorsEqual`, `clean_color_code`, `safe_float`) rather than re-implementing color/number handling.
  - Keep queries consistent with `set_code='TLA'` or expose set as a configurable constant when changing ingestion targets.
  - Preserve local conventions (French comments near ETL; variable naming scheme in frontend).
- Don't:
  - Reformat the DB field names or conflict keys without updating both ETL and frontend queries.
  - Assume unknown Supabase roles/permissions — changes to auth or database schema require a manual check with the maintainers.

## Small code examples to copy/paste
- Query global card stats in `App.jsx`:
  ```js
  await supabase.from('card_stats')
    .select('card_name, gih_wr, alsa')
    .eq('set_code','TLA').eq('filter_context','Global').eq('format', activeFormat)
  ```
- ETL safe post (decks):
  ```py
  resp = requests.post(api_url, json=records, headers=HEADERS_SUPABASE)
  if resp.status_code >= 400:
      print(f"❌ Erreur Supabase (Decks): {resp.text}")
  ```

---

If any of these items are unclear or you want additional coverage (e.g., CI steps, schema DDL, or more examples), tell me which section to expand and I’ll iterate. ✅
