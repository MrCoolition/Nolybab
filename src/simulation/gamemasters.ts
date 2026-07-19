import {
  DIRECTORS,
  DIRECTOR_BY_ID,
  DIRECTOR_KNOBS,
  DIRECTOR_THOUGHTS,
  QUESTION_LANGUAGE,
  VOICE_BY_ID,
} from './content';
import { clamp, lerp, mean, normalizedDifference, SeededRandom } from './random';
import { QUALITY_KEYS } from './types';
import type {
  CivicQuestion,
  DirectorId,
  DirectorState,
  QualityKey,
  QualityMap,
  SimulationState,
  VoiceId,
} from './types';

const COMPLEMENTS: Record<QualityKey, QualityKey[]> = {
  coherence: ['plurality', 'reciprocity'],
  plurality: ['coherence', 'agency'],
  reciprocity: ['agency', 'biosphere'],
  biosphere: ['reciprocity', 'wonder'],
  agency: ['coherence', 'plurality'],
  wonder: ['biosphere', 'plurality'],
};

export function initialDirectors(rng: SeededRandom): DirectorState[] {
  return DIRECTORS.map((definition, index) => ({
    id: definition.id,
    influence: 0.48 + rng.between(-0.08, 0.08),
    appetite: 0.45 + index * 0.035 + rng.between(-0.06, 0.06),
    lastAuthored: -10 - index,
    thought: rng.pick(DIRECTOR_THOUGHTS[definition.id]),
    knob: rng.pick(DIRECTOR_KNOBS[definition.id]),
  }));
}

function relationAverage(state: SimulationState): number {
  return mean(state.relationships.map((relationship) => relationship.strength));
}

function unresolvedRatio(state: SimulationState): number {
  if (state.lessons.length === 0) return 0;
  return state.lessons.filter((lesson) => !lesson.resolved).length / Math.max(4, state.lessons.length);
}

function dominantVoice(state: SimulationState): VoiceId {
  return state.voices.reduce((highest, voice) => (voice.attention > highest.attention ? voice : highest)).id;
}

function directorUrgency(id: DirectorId, state: SimulationState): number {
  const attentionSpread = normalizedDifference(state.voices.map((voice) => voice.attention + 1));
  const autopilotRatio = state.autonomousResponses / Math.max(1, state.resolvedQuestions);
  const linkHealth = relationAverage(state);
  const quality = state.qualities[DIRECTOR_BY_ID[id].quality];
  const baseDeficit = 1 - quality;

  switch (id) {
    case 'chorus':
      return clamp(baseDeficit * 0.62 + attentionSpread * 0.62 + Math.max(0, state.qualities.coherence - state.qualities.plurality) * 0.5);
    case 'ecology':
      return clamp(baseDeficit * 0.74 + (1 - state.qualities.reciprocity) * 0.18 + state.knobs.convergence * 0.12);
    case 'mirror':
      return clamp(baseDeficit * 0.52 + autopilotRatio * 0.5 + attentionSpread * 0.28 + (1 - state.qualities.agency) * 0.32);
    case 'archivist':
      return clamp(baseDeficit * 0.28 + unresolvedRatio(state) * 0.72 + (state.lessons.length > 0 ? 0.12 : 0));
    case 'wild':
      return clamp(baseDeficit * 0.67 + Math.max(0, linkHealth - 0.58) * 0.4 + Math.max(0, 0.55 - state.knobs.novelty) * 0.26);
  }
}

export function stepGamemasters(state: SimulationState, rng: SeededRandom, amount = 1): void {
  for (const director of state.directors) {
    const urgency = directorUrgency(director.id, state);
    const authorshipFatigue = director.lastAuthored === state.cycle ? 0.22 : 0;
    const target = clamp(0.22 + urgency * 0.72 + director.appetite * 0.16 - authorshipFatigue, 0.12, 0.98);
    director.influence = lerp(director.influence, target, 0.07 * amount);
    director.appetite = clamp(director.appetite + rng.between(-0.009, 0.012) * amount, 0.18, 0.92);

    if (rng.next() < 0.045 * amount) {
      director.thought = contextualThought(director.id, state, rng);
      director.knob = rng.pick(DIRECTOR_KNOBS[director.id]);
    }
  }

  const influence = (id: DirectorId) => state.directors.find((director) => director.id === id)?.influence ?? 0.5;
  const attentionSpread = normalizedDifference(state.voices.map((voice) => voice.attention + 1));
  const unresolved = unresolvedRatio(state);

  state.knobs.dissonance = lerp(
    state.knobs.dissonance,
    clamp(0.22 + attentionSpread * 0.42 + (1 - relationAverage(state)) * 0.25),
    0.035 * amount,
  );
  state.knobs.ecologicalPressure = lerp(
    state.knobs.ecologicalPressure,
    clamp((1 - state.qualities.biosphere) * 0.72 + influence('ecology') * 0.24),
    0.04 * amount,
  );
  state.knobs.memoryPressure = lerp(
    state.knobs.memoryPressure,
    clamp(unresolved * 0.72 + influence('archivist') * 0.24),
    0.04 * amount,
  );
  state.knobs.novelty = lerp(
    state.knobs.novelty,
    clamp(influence('wild') * 0.64 + (1 - state.qualities.wonder) * 0.36),
    0.032 * amount,
  );
  state.knobs.convergence = lerp(
    state.knobs.convergence,
    clamp(state.qualities.coherence * 0.54 + relationAverage(state) * 0.46),
    0.03 * amount,
  );
}

function contextualThought(id: DirectorId, state: SimulationState, rng: SeededRandom): string {
  const dominant = VOICE_BY_ID[dominantVoice(state)].shortName;
  const weakest = QUALITY_KEYS.reduce((lowest, quality) =>
    state.qualities[quality] < state.qualities[lowest] ? quality : lowest,
  );
  const unresolved = state.lessons.filter((lesson) => !lesson.resolved);

  if (id === 'chorus' && normalizedDifference(state.voices.map((voice) => voice.attention + 1)) > 0.18) {
    return `${dominant} are becoming fluent in the player. Listening underneath that fluency.`;
  }
  if (id === 'archivist' && unresolved.length > 0) {
    return `Keeping “${rng.pick(unresolved).title}” warm enough to return.`;
  }
  if (id === 'mirror') {
    return `Testing whether ${dominant.toLowerCase()} wisdom has become a reflex.`;
  }
  if (id === 'ecology' && state.qualities.biosphere < 0.5) {
    return 'Giving consequence a non-human voice before the next answer forms.';
  }
  if (id === 'wild' && state.qualities.wonder > 0.72) {
    return 'Wonder is healthy. Making it stranger, not merely larger.';
  }
  return `${rng.pick(DIRECTOR_THOUGHTS[id])} Watching ${weakest}.`;
}

function focusForDirector(id: DirectorId, state: SimulationState, rng: SeededRandom): QualityKey {
  if (id === 'archivist') {
    const unresolved = state.lessons.filter((lesson) => !lesson.resolved);
    if (unresolved.length > 0 && rng.next() < 0.66) return rng.pick(unresolved).focus;
  }

  if (id === 'mirror') {
    const dominant = VOICE_BY_ID[dominantVoice(state)];
    const shadowQuality = QUALITY_KEYS.reduce((lowest, quality) =>
      dominant.affinities[quality] < dominant.affinities[lowest] ? quality : lowest,
    );
    if (rng.next() < 0.68) return shadowQuality;
  }

  const native = DIRECTOR_BY_ID[id].quality;
  const weakest = QUALITY_KEYS.reduce((lowest, quality) =>
    state.qualities[quality] < state.qualities[lowest] ? quality : lowest,
  );
  return rng.next() < 0.58 ? native : weakest;
}

function emptyNeeds(): QualityMap {
  return {
    coherence: 0.08,
    plurality: 0.08,
    reciprocity: 0.08,
    biosphere: 0.08,
    agency: 0.08,
    wonder: 0.08,
  };
}

export function generateQuestion(state: SimulationState, rng: SeededRandom): CivicQuestion {
  const director = rng.weighted(state.directors, (candidate) => {
    const recencyPenalty = state.cycle - candidate.lastAuthored < 2 ? 0.32 : 1;
    return (candidate.influence * 0.74 + candidate.appetite * 0.26) * recencyPenalty;
  });
  const focus = focusForDirector(director.id, state, rng);
  const language = QUESTION_LANGUAGE[focus];
  const subject = rng.pick(language.subjects);
  const disturbance = rng.pick(language.disturbances);
  const consequence = rng.pick(language.consequences);
  const prompt = rng.pick(language.prompts);
  const complement = rng.pick(COMPLEMENTS[focus]);
  const needs = emptyNeeds();
  needs[focus] = 0.92;
  needs[complement] = 0.58;

  if (director.id === 'ecology') needs.biosphere = Math.max(needs.biosphere, 0.76);
  if (director.id === 'chorus') needs.plurality = Math.max(needs.plurality, 0.78);
  if (director.id === 'mirror') needs.agency = Math.max(needs.agency, 0.74);
  if (director.id === 'wild') needs.wonder = Math.max(needs.wonder, 0.8);

  const pressure = clamp(
    0.28 +
      (1 - state.qualities[focus]) * 0.38 +
      state.knobs.dissonance * 0.12 +
      state.epoch * 0.018 +
      rng.between(-0.05, 0.08),
    0.28,
    0.92,
  );

  director.lastAuthored = state.cycle;
  director.appetite = clamp(director.appetite - 0.12, 0.16, 1);
  director.thought = `Authored the current pressure around ${focus}.`;

  const title = `${subject} ${disturbance}`;
  const lawEcho = state.laws.length > 0 && rng.next() < 0.42 ? ` The epoch’s law—“${state.laws.at(-1)?.title}”—is implicated.` : '';

  return {
    id: `q-${state.epoch}-${state.cycle}-${rng.state.toString(16)}`,
    title,
    situation: `${consequence}.${lawEcho}`,
    prompt,
    director: director.id,
    focus,
    needs,
    tags: [focus, rng.pick(language.tags), director.id],
    pressure,
    secondsLeft: Math.max(42, 74 - state.epoch * 2),
    bornAt: state.elapsed,
  };
}

export function bestAutonomousPair(state: SimulationState): [VoiceId, VoiceId] {
  const question = state.currentQuestion;
  if (!question) return ['cultivators', 'harbingers'];

  let bestPair: [VoiceId, VoiceId] = [state.voices[0]?.id ?? 'pioneers', state.voices[1]?.id ?? 'innovators'];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let left = 0; left < state.voices.length; left += 1) {
    for (let right = left + 1; right < state.voices.length; right += 1) {
      const a = state.voices[left];
      const b = state.voices[right];
      if (!a || !b) continue;
      const aDef = VOICE_BY_ID[a.id];
      const bDef = VOICE_BY_ID[b.id];
      const coverage = mean(
        QUALITY_KEYS.map((quality) => question.needs[quality] * Math.max(aDef.affinities[quality], bDef.affinities[quality])),
      );
      const underheard = 1 / (2 + a.attention + b.attention);
      const contrast = mean(QUALITY_KEYS.map((quality) => Math.abs(aDef.affinities[quality] - bDef.affinities[quality])));
      const score = coverage * 0.64 + underheard * 0.8 + contrast * 0.28;
      if (score > bestScore) {
        bestScore = score;
        bestPair = [a.id, b.id];
      }
    }
  }
  return bestPair;
}
