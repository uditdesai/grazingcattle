# Grazing Cattle

An asynchronous cattle/pasture management game centered on natural grazing,
ecological balance, and stewardship — not capitalist expansion. The player
manages fencing and herd movement so cattle graze naturally while maintaining
grass and soil health. The farm keeps simulating while the player is away.

Domain: [grazingcattle.farm](https://grazingcattle.farm) (not yet deployed)

## Status

🚧 Milestone 1: core simulation + a bare developer screen to test it. No
database, no auth, no rendering yet — see `packages/simulation`.

## Stack

TypeScript everywhere. Next.js (App Router) frontend + Route Handler backend,
a standalone `packages/simulation` package with no framework dependency,
PostgreSQL via Supabase + Drizzle ORM (added in Milestone 2), PixiJS for farm
rendering (added later). pnpm workspaces monorepo.

## Development

```bash
pnpm install
pnpm sim          # run the simulation CLI harness
pnpm dev          # run the Next.js app (apps/web)
```

Requires Node 24 (see `.nvmrc`) and pnpm.
