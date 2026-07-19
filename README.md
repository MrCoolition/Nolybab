# Nolybab: Reverse Babylon

An open-ended civilization organism about learning to act together without becoming the same.

Nolybab is **not a city builder**. Seven cultures meet living pressures, hold councils, choose civic actions, and permanently alter the Commons. Growth appears as relationships, rituals, covenants, protocols, shared words, remembered scars, and procedural artifacts—not territory or inventory.

## The civic loop

1. **Pressure** — an internal gamemaster reveals a need and frames the living question.
2. **Council** — seat two unlike cultures; each brings a gift, a shadow, and a right to resist.
3. **Decide** — choose a shared minimum, carry protected difference, or begin a reversible trial.
4. **Act** — the council turns that choice into a concrete civic work with a real cost.
5. **Grow** — the work draws itself into the Commons and changes later questions.

Unanswered pressures are resolved autonomously. Failures are not reloads: they become strata in Mistake Mountain and can be carried into a later council until their civic function changes.

There is no final victory. Healthy civilizations enter new Dawns with new constraints; unhealthy ones compost into another epoch while inheriting their memory.

## The eight gamemasters

- **The Chorus** protects plurality and watches for semantic monoculture.
- **The Mycelium** gives ecological consequences non-human agency.
- **The Countermirror** learns the player’s habits and exposes their shadows.
- **The Archivist** resurfaces unfinished mistakes.
- **The Uninvited** protects novelty and unoptimized attention.
- **The Illustrator** converts consequences into procedural visual grammar.
- **The Civic Architect** keeps structures permeable, reversible, and answerable.
- **The Storyweaver** binds today’s choice to its causes and descendants.

The last three can be amplified server-side by `gpt-5.4-nano`. Model output can enrich language and visual direction, but it cannot change votes, costs, odds, qualities, timers, IDs, or deterministic simulation rules.

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

- `OPEN_AI_API_KEY` (or `OPENAI_API_KEY`) — enables the Nano atelier through `/api/gamemaster`.
- `NEON_DB_CONNECT` (or `DATABASE_URL`) — enables durable world checkpoints and the append-only civic ledger through `/api/world`.

Secrets are read only by serverless functions and are never included in the browser bundle. Without either service, the deterministic local simulation continues uninterrupted.

The Neon schema is created lazily by the API and is also documented in `docs/schema.sql`. Each browser creates a private world ID and write key. The server stores only a SHA-256 hash of that key. Checkpoints use monotonic revisions, while civic events and artifacts are append-only and replay-safe.

## Controls

- Click/tap world glyphs or roster names to seat cultures.
- `1`–`7` seats cultures by their circular order.
- `Enter` enacts the selected proposal.
- `Space` pauses or resumes the organism.
- `M` opens Memory.
- `G` opens the gamemasters.
- `?` opens How It Works.

## Architecture

- `src/simulation/` owns deterministic civic rules and serializable state.
- `src/rendering/` translates state into the procedural Phaser world; it never owns mechanics.
- `src/ui/` owns the accessible council surface, drawers, onboarding, and controls.
- `src/ai/` validates optional Nano enrichment.
- `src/persistence/` owns local identity, durable checkpoints, and ledger synchronization.
- `api/` contains the OpenAI and Neon Vercel functions.

## Audio

Track 01: `Whispers of the Sacred Canopy`, supplied for this project at `public/audio/whispers-of-the-sacred-canopy.wav`.
