# Nolybab: Reverse Babylon

Nolybab is a living civilization simulation about humans arriving after extractive civilization has failed and learning to settle without rebuilding the machine that ended it.

It is not a city builder. The player authors civic moves in a spatial, evolving world: shelter an arrival, seed a habitat, amend a law, translate between cultures, prototype an invention, reroute a pressure, invite the unknown, compost a failed institution, or refuse a harmful demand. The visible world grows from those choices as people, paths, settlements, ecological systems, charters, rituals, inventions, and remembered scars.

## The playable loop

1. **Read the world** — moving pressures, arriving communities, living regions, and existing artifacts are direct spatial targets.
2. **Choose what changes** — habitat, law, culture, or invention.
3. **Author the act** — select a verb, method, intensity, lead culture, ally, target, and optional name.
4. **See the stakes** — finite attention, trust, vitality, and possibility produce a deterministic cost, risk, and consequence forecast.
5. **Commit or interrupt** — act immediately, hold an autonomous response, or physically reroute a pressure.
6. **Watch civilization answer** — people move and settle; construction unfolds; routes, ecologies, laws, practices, and inventions mutate over time.

There is no fixed tech tree and no final victory. Repeated habits lose potency. Dissent, ecological cost, and unresolved mistakes remain playable. Healthy worlds flourish into stranger forms; damaged worlds fracture and regenerate while keeping their history.

## The living atelier

`gpt-5.4-nano` enters early and often through the server:

- **Arrival** — names and characterizes the human community, their skills, needs, vow, and sustainable visual language.
- **Foresee** — enriches the action forecast while the player aims a move.
- **Consequence** — names the created artifact, gives it a doctrine or blueprint, voices dissent, and supplies procedural visual direction.

The Illustrator, Ecologist, Anthropologist, Inventor, Civic Architect, and Storyweaver are expressive gamemasters. Model output is strictly structured and validated. It may enrich names, descriptions, options, and visual grammar; it cannot invent IDs, spend resources, alter odds, or bypass deterministic civic rules.

If Nano is unavailable, cached and procedural generation keep the world playable without blocking input.

## Memory and infinite expansion

The browser keeps the active organism responsive. Neon stores revisioned checkpoints plus an append-only ledger containing every authored action and every settlement, region, arrival, site, law, cultural practice, invention, civic work, shared word, and remembered scar. Older active details can compact out of the immediate simulation without being erased from the civilization's deep history.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

Production check:

```bash
npm run build
npm run preview
```

## Vercel environment

Set these as encrypted Production and Preview variables:

- `OPEN_AI_API_KEY` (or `OPENAI_API_KEY`) enables the Nano living atelier.
- `NEON_DB_CONNECT` (or `DATABASE_URL`) enables checkpoints and the append-only civic ledger.

Secrets stay in Vercel Functions and are never shipped to the browser. `/api/nano-civic` owns arrival, forecast, and consequence generations; `/api/gamemaster` remains compatible with older council saves; `/api/world` owns durable world memory.

## Architecture

- `src/simulation/` owns deterministic, serializable civic mechanics.
- `src/rendering/` turns state into a procedural Phaser landscape; it never owns game rules.
- `src/ui/` owns the accessible command deck, previews, records, and guidance.
- `src/ai/` validates optional Nano generations.
- `src/persistence/` owns local identity, checkpoint compaction, and ledger synchronization.
- `api/` contains the OpenAI and Neon Vercel Functions.

## Audio

Track 01 is `Whispers of the Sacred Canopy`, supplied for this project at `public/audio/whispers-of-the-sacred-canopy.wav`.
