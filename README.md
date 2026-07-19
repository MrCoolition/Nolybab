# Nolybab: Reverse Babylon

An open-ended browser simulation about building mutual intelligibility without cultural sameness.

Nolybab is **not a city builder**. The civilization is a living semantic organism: seven partial truths, their relationships, the shared words they invent, the habits they repeat, and the mistakes they refuse to erase. Five adaptive internal gamemasters continuously read that organism and turn its pressures—even when the player does nothing.

## The playable loop

1. **Listen** by selecting a culture-voice and reading its lens and shadow.
2. **Weave** two unlike voices through the current living question.
3. **Challenge** any gamemaster whose framing is becoming too absolute.
4. **Reframe** an unresolved mistake by carrying its scar into a later weave.

A successful synthesis grows a new shared word. A failed synthesis adds a permanent visible stratum to Mistake Mountain. Reframing that stratum converts it into a persistent civic sense—such as *The river has standing* or *Right to pause*—which changes future resolution rules.

There is no final victory. Every nine questions, a balanced civilization enters a new Dawn with a new constraint; an unhealthy one composts into another epoch while retaining its memory.

## Run it

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:4173`.

Production check:

```bash
npm run build
npm run preview
```

## Controls

- Click/tap culture glyphs to hold up to two voices.
- `1`–`7` selects voices by their circular order.
- `Enter` commits a weave.
- `Space` pauses or resumes the organism.
- `M` opens Memory.
- `G` opens the internal gamemasters.
- The circular controls change pause, time speed, and audio.

Unanswered questions are resolved autonomously. Walking away is a valid experiment; it costs some human agency but proves the world does not wait for a player to exist.

## What continually adapts

- **The Chorus** watches voice parity and semantic monoculture.
- **The Mycelium** gives ecological consequences non-human agency.
- **The Countermirror** learns the player’s favorite voices and exposes their shadows.
- **The Archivist** resurfaces unresolved mistakes when the present can use them.
- **The Uninvited** protects novelty, mutation, and unoptimized attention.

Their influence, appetite, thoughts, and shared control knobs update continuously. Questions are assembled from the weakest civic quality, gamemaster agenda, player attention pattern, remembered scars, epoch laws, and a seeded generative grammar.

## Architecture

- `src/simulation/` owns all serializable rules, histories, questions, gamemasters, relationships, and persistence.
- `src/rendering/` translates simulation state into a procedural Phaser world. It never owns game rules.
- `src/ui/` owns the accessible DOM interface, drawers, onboarding, and controls.
- `src/audio/` adapts Track 01 and small generated cues to simulation state.

The seed phrase and PRNG state are saved in local storage. No API key or network model is required for the internal game AI.

## Audio

Track 01: `Whispers of the Sacred Canopy`, supplied for this project at `public/audio/whispers-of-the-sacred-canopy.wav`.
