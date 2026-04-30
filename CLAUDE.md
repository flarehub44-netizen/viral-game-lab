# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server on port 8080
npm run build        # Production build
npm run build:dev    # Development build
npm run lint         # ESLint checks
npm run preview      # Preview production build
npm run test         # Run tests once (Vitest)
npm run test:watch   # Watch mode
npm run typecheck:strict  # Strict TypeScript check (tsconfig.strict.json)
```

Run a single test file:
```bash
npx vitest run src/test/example.test.ts
```

> Note: the default `tsconfig.json` has `noImplicitAny`, `strictNullChecks`, and `noUnusedLocals` disabled for rapid prototyping. Use `typecheck:strict` for rigorous checks.

## Architecture

This is a **mobile-first arcade game** (Neon Split) built as a React web app. Players tap to split neon balls through barriers. The game targets a max-width 420px container, optimized for touch.

### Two play modes

The app has two fully distinct operating modes, gated in `src/pages/Index.tsx`:

- **Demo mode** — guest (no auth), `sessionStorage` flag `ns_play_mode=demo`. Economy is localStorage-only. Progression stored under `ns_prog_demo_v1`. Best score under `ns_best_demo`.
- **Online mode** — Supabase auth required. Economy is server-side. Progression stored under `ns_prog_v1`. Best score under `ns_best_{userId}`.

Auth flow: `AuthScreen` → (age gate if `over_18_confirmed_at` is null) → `LobbyScreen`.

### Core game layers

**Game Engine** (`src/game/engine.ts`, ~910 lines) — standalone Canvas2D class, no React dependency:
- Manages all game state: balls, barriers, particles, popups, power-ups
- Public API: `start(opts?)`, `tap()`, `pause()`, `resume()`, `stop()`
- Fires two callbacks: `onStatsChange()` (throttled 100ms) and `onGameOver()`
- `start({ script })` accepts an optional `RoundScript` (= `VisualResult`) that puts the engine in **reveal mode**: the round terminates as soon as `barriers_crossed`, `score_target`, or `duration_seconds` is reached — the visual outcome is pre-scripted by the server
- Pre-renders ball sprites to off-screen canvases (6 hue variants) for performance
- Hard caps: 128 balls, 60 particles, 18 popups
- Combo tier score bonuses: ×1.1 at combo 5, ×1.25 at 10, ×1.5 at 20, ×2.0 at 30

**Progression** (`src/game/progression.ts`, ~363 lines) — pure logic, no React:
- XP formula: `score + (maxCombo × 2) + (durationSeconds × 0.5)` + mission/achievement bonuses
- Daily missions use a deterministic seeded RNG keyed to calendar date (all players see the same 3 missions)
- `applyRound(summary, profile)` is the single entry point — call it once per game over
- All state stored in `localStorage` as JSON; two profiles: `"default"` and `"demo"`

**Difficulty** (`src/game/difficulty.ts`) — wave-based curve:
- Ramps 0→0.92 over time, cycling every 25s with +0.02 per cycle
- Barrier spawn interval: 1.5s → 0.8s as difficulty increases

**Audio** (`src/game/audio.ts`) — Web Audio API, lazy-initialized on first user gesture; Vibration API for haptics.

### Economy subsystem (`src/game/economy/`)

The economy is the most critical correctness boundary. **Payout is determined at round START, not at round end.** The gameplay is a visual reveal.

Key files:
- `multiplierTable.ts` — RTP ≈ 85.7% table with 11 tiers (×0 to ×20). **Mirrored exactly** in `supabase/functions/_shared/multiplierTable.ts`. Any change must be applied to both.
- `serverRound.ts` — TypeScript interfaces for the `start-round` Edge Function response (`StartRoundResponse`, `ActiveServerRound`).
- `demoRound.ts` — client-side round settlement for demo mode; uses `mulberry32` PRNG seeded from `roundId`. Mirrors the Edge Function logic.
- `walletStore.ts` — localStorage wallet (`ns_wallet_v1`), max 80 transactions, balance/reserved/history.
- `settlement.ts` — `mulberry32` PRNG implementation.
- `constants.ts` — `MIN_STAKE=1`, `MAX_STAKE=50`, `MAX_ROUND_PAYOUT=400`, `INITIAL_WALLET_BALANCE=150`.

### React layer

- **`src/pages/Index.tsx`** — top-level orchestrator: screen state machine, auth gating, round lifecycle, delegates to engine and progression
- **`src/components/GameCanvas.tsx`** — mounts the canvas, forwards touch/click to the engine, receives `visualScript` from active round
- **`src/components/economy/`** — `LobbyScreen`, `RoundSetupScreen`, `WalletScreen`, `RulesScreen`
- **`src/components/auth/`** — `AuthScreen` (login/register + demo option), `AgeGateScreen` (18+ confirmation)
- **`src/components/ui/`** — 50+ shadcn/ui components (Radix UI primitives); modify these rarely
- **`src/contexts/AuthContext.tsx`** — wraps Supabase auth session; provides `session`, `user`, `signIn`, `signUp`, `signOut`

### Backend (Supabase)

Tables: `scores`, `profiles` (display_name, kyc_status, over_18_confirmed_at), `wallets` (balance), `ledger_entries` (full audit trail), `game_rounds` (stake, payout, visual_result, net_result).

Edge Functions:
- `start-round` — validates age gate, deducts stake atomically via `start_round_atomic` RPC, samples multiplier with `crypto.getRandomValues`, returns full round payload including `visual_result`. Requires `mode=target_20x`.
- `submit-score` — server-side validation before inserting into `scores`.

RLS: `scores` is public SELECT + INSERT. Other tables require auth.

### State management

| Layer | Used for |
|---|---|
| React component state | UI screen transitions, HUD stats, loading flags |
| Game engine class | All game entities and physics |
| `localStorage` (`ns_*` prefix) | Nickname, best score, progression (XP/missions/achievements), demo wallet |
| `sessionStorage` | `ns_play_mode` — demo flag, cleared on login |
| TanStack React Query | Leaderboard fetching/caching (30s TTL) |

### Path alias

`@/*` resolves to `./src/*` (configured in `tsconfig.json` and `vite.config.ts`).

### UI / Styling

- Tailwind CSS 3.4 with HSL CSS variables — dark neon theme defined in `src/index.css`
- shadcn/ui with `slate` base color, `default` style, CSS variables enabled (`components.json`)
- Dark mode via `class` strategy (next-themes)

### Environment variables

```
VITE_SUPABASE_URL
VITE_SUPABASE_PROJECT_ID
VITE_SUPABASE_PUBLISHABLE_KEY
```
