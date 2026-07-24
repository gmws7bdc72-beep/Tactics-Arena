# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Football Tactics Arena Game (`artifacts/fta-game`)

Browser-based soccer tactics game. Frontend-only (no API/DB needed), state persisted via localStorage.

### Architecture
- **Pitch**: 700×460 logical units rendered on HTML Canvas (PitchCanvas.tsx)
- **Team size**: 4 players per team
- **Match**: 12 turns, 60 ticks/turn (deterministic seeded simulation runs instantly, then plays back at 60fps over ~3 seconds)
- **Arenas**: Bronze → Silver → Gold → Elite (3 wins to promote, 3 losses to relegate)

### Key Files
- `src/engine/types.ts` — SimPlayer, SimBall, Command, FrameSnapshot, GameEvent types
- `src/engine/simulation.ts` — tick-based simulation engine (deterministic, seeded RNG)
- `src/engine/ai.ts` — rule-based AI opponent
- `src/engine/constants.ts` — all tuning constants (speeds, radii, physics)
- `src/pages/Match.tsx` — main match orchestration (planning → simulating → next turn)
- `src/components/PitchCanvas.tsx` — canvas renderer for pitch, players, ball, overlays
- `src/components/EventLog.tsx` — scrolling event feed
- `src/game/players.ts` — player roster with abilities
- `src/game/formations.ts` — formation layouts
- `src/game/persistence.ts` — localStorage save/load
- `src/hooks/useGameState.ts` — React hook wrapping persistence

### Player Abilities
`bullet_pass`, `iron_tackle`, `ghost_run`, `eagle_eye`, `powerhouse`, `shadow_mark`

### Command Flow
Click player → select → choose Move/Pass/Shoot → click target → Confirm runs simulation
