import {
  COUNCIL_FORMS,
  DIRECTORS,
  DIRECTOR_BY_ID,
  DIRECTOR_KNOBS,
  DIRECTOR_THOUGHTS,
  QUALITY_META,
  QUESTION_LANGUAGE,
  VOICE_BY_ID,
} from './content';
import { clamp, lerp, mean, normalizedDifference, SeededRandom } from './random';
import { QUALITY_KEYS } from './types';
import type {
  CivicProposal,
  CivicQuestion,
  CouncilPosition,
  DirectorId,
  DirectorState,
  Lesson,
  ProposalMode,
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
    case 'illustrator': {
      const recent = state.works.slice(-6);
      const distinctMotifs = new Set(recent.map((work) => work.art.motif)).size;
      const visualRepetition = recent.length < 2 ? 0.28 : 1 - distinctMotifs / Math.min(6, recent.length);
      return clamp(baseDeficit * 0.48 + visualRepetition * 0.46 + state.knobs.novelty * 0.16);
    }
    case 'architect':
      return clamp(baseDeficit * 0.56 + (1 - linkHealth) * 0.34 + (1 - state.qualities.agency) * 0.26);
    case 'storyweaver':
      return clamp(baseDeficit * 0.4 + unresolvedRatio(state) * 0.48 + Math.max(0, state.works.length - state.lexicon.length) * 0.012);
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
  if (id === 'illustrator') {
    return state.works.length === 0
      ? 'Preparing a visible grammar for the first decision.'
      : `Letting “${state.works.at(-1)?.title ?? 'the last decision'}” alter the world’s line.`;
  }
  if (id === 'architect') {
    return state.civicPhase === 'council' || state.civicPhase === 'decision'
      ? 'Testing whether the active council preserves a meaningful no.'
      : 'Preparing a reversible structure for the next pressure.';
  }
  if (id === 'storyweaver' && state.history.length > 0) {
    return `Tracing today’s pressure back through “${state.history[0]?.title ?? 'the first memory'}.”`;
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

  if (id === 'storyweaver') {
    const unresolved = state.lessons.filter((lesson) => !lesson.resolved);
    if (unresolved.length > 0 && rng.next() < 0.72) return rng.pick(unresolved).focus;
  }

  if (id === 'architect' && rng.next() < 0.68) {
    return state.qualities.coherence < state.qualities.agency ? 'coherence' : 'agency';
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
  if (director.id === 'illustrator') needs.wonder = Math.max(needs.wonder, 0.72);
  if (director.id === 'architect') needs.coherence = Math.max(needs.coherence, 0.74);
  if (director.id === 'storyweaver') needs.reciprocity = Math.max(needs.reciprocity, 0.72);

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

const PROPOSAL_MODES: readonly ProposalMode[] = [
  'shared-minimum',
  'carry-difference',
  'reversible-trial',
];

const COST_QUALITY: Record<ProposalMode, QualityKey> = {
  'shared-minimum': 'plurality',
  'carry-difference': 'coherence',
  'reversible-trial': 'reciprocity',
};

function relationshipWithAuthors(state: SimulationState, voiceId: VoiceId, authors: [VoiceId, VoiceId]): number {
  if (authors.includes(voiceId)) return 0.72;
  const links = state.relationships.filter(
    (relationship) =>
      (relationship.a === voiceId && authors.includes(relationship.b)) ||
      (relationship.b === voiceId && authors.includes(relationship.a)),
  );
  return links.length > 0 ? mean(links.map((relationship) => relationship.strength)) : 0.12;
}

function proposalSupport(
  state: SimulationState,
  mode: ProposalMode,
  voiceId: VoiceId,
  authors: [VoiceId, VoiceId],
  lesson?: Lesson,
): number {
  const question = state.currentQuestion;
  if (!question) return 0;
  const voice = VOICE_BY_ID[voiceId];
  const form = COUNCIL_FORMS[mode];
  const needsTotal = QUALITY_KEYS.reduce((sum, quality) => sum + question.needs[quality], 0);
  const coverage =
    QUALITY_KEYS.reduce((sum, quality) => sum + question.needs[quality] * voice.affinities[quality], 0) /
    Math.max(0.01, needsTotal);
  const formTotal = QUALITY_KEYS.reduce((sum, quality) => sum + form.supportWeights[quality], 0);
  const formFit =
    QUALITY_KEYS.reduce((sum, quality) => sum + form.supportWeights[quality] * voice.affinities[quality], 0) /
    Math.max(0.01, formTotal);
  const voiceState = state.voices.find((candidate) => candidate.id === voiceId);
  const maxAttention = Math.max(1, ...state.voices.map((candidate) => candidate.attention));
  const underheard = 1 - (voiceState?.attention ?? 0) / maxAttention;
  const relationship = relationshipWithAuthors(state, voiceId, authors);
  const lessonFit = lesson && (lesson.focus === question.focus || lesson.tags.some((tag) => question.tags.includes(tag))) ? 0.07 : 0;
  const authorVoice = authors.includes(voiceId) ? 0.17 : 0;

  return clamp(
    (coverage - 0.5) * 0.82 +
      (formFit - 0.5) * 0.68 +
      (relationship - 0.18) * 0.42 +
      underheard * 0.045 +
      authorVoice +
      lessonFit -
      voice.affinities[COST_QUALITY[mode]] * 0.18 -
      question.pressure * 0.11,
    -1,
    1,
  );
}

function councilPosition(support: number): CouncilPosition {
  if (support >= 0.1) return 'consent';
  if (support > -0.18) return 'stand-aside';
  return 'object';
}

function proposalCopy(
  mode: ProposalMode,
  authors: [VoiceId, VoiceId],
  question: CivicQuestion,
): { title: string; summary: string; decision: string } {
  const a = VOICE_BY_ID[authors[0]];
  const b = VOICE_BY_ID[authors[1]];
  if (mode === 'shared-minimum') {
    return {
      title: `${a.shortName} and ${b.shortName} name the minimum`,
      summary: `${a.gift}, held answerable by ${b.gift}.`,
      decision: `For “${question.title},” act only on what these meanings can safely share; leave every other reason untranslated.`,
    };
  }
  if (mode === 'carry-difference') {
    return {
      title: `${a.shortName} and ${b.shortName} keep both reasons visible`,
      summary: `${a.shortName} may ${a.verb}; ${b.shortName} may ${b.verb}. Coordination does not require one account to win.`,
      decision: `Answer “${question.title}” through a braid whose unlike strands remain named and challengeable.`,
    };
  }
  return {
    title: `A reversible answer to ${question.title.toLowerCase()}`,
    summary: `${a.shortName} and ${b.shortName} try a bounded civic practice with an explicit right to stop and revise it.`,
    decision: `Let this answer live for three encounters, then return it to council with its consequences visible.`,
  };
}

export function generateCouncilProposals(
  state: SimulationState,
  authors: [VoiceId, VoiceId],
  lesson: Lesson | undefined,
  rng: SeededRandom,
): CivicProposal[] {
  const question = state.currentQuestion;
  if (!question) return [];

  return PROPOSAL_MODES.map((mode, index) => {
    const form = COUNCIL_FORMS[mode];
    const support = Object.fromEntries(
      state.voices.map((voice) => [voice.id, proposalSupport(state, mode, voice.id, authors, lesson)]),
    ) as Record<VoiceId, number>;
    const positions = Object.fromEntries(
      state.voices.map((voice) => [voice.id, councilPosition(support[voice.id])]),
    ) as Record<VoiceId, CouncilPosition>;
    const copy = proposalCopy(mode, authors, question);
    const workKind =
      question.focus === 'biosphere' && mode === 'reversible-trial'
        ? 'ecological-covenant'
        : rng.pick(form.workKinds);

    return {
      id: `proposal-${state.epoch}-${state.cycle}-${index}-${rng.state.toString(16)}`,
      mode,
      ...copy,
      cost: {
        quality: COST_QUALITY[mode],
        amount: form.costAmount,
        description: form.shadow,
      },
      workKind,
      art: {
        motif: form.motif,
        geometry: form.geometry,
        motion: form.motion,
        palette: [
          VOICE_BY_ID[authors[0]].cssColor,
          VOICE_BY_ID[authors[1]].cssColor,
          QUALITY_META[question.focus].color,
        ],
        density: clamp(0.42 + question.pressure * 0.24 + index * 0.055),
        symmetry: mode === 'shared-minimum' ? 0.72 : mode === 'carry-difference' ? 0.28 : 0.46,
        texture: mode === 'carry-difference' ? 'visible seams and counterflow' : mode === 'shared-minimum' ? 'a narrow luminous threshold' : 'porous layers with an unfinished edge',
        caption: form.label,
      },
      source: 'deterministic',
      authors,
      focus: question.focus,
      support,
      positions,
      promise: form.promise,
      shadow: form.shadow,
      lessonId: lesson?.id,
    } satisfies CivicProposal;
  });
}

export function proposalHasConsent(proposal: CivicProposal): boolean {
  const values = Object.values(proposal.positions);
  const consent = values.filter((position) => position === 'consent').length;
  const objections = values.filter((position) => position === 'object').length;
  const hardObjection = Object.values(proposal.support).some((support) => support < -0.42);
  if (proposal.mode === 'shared-minimum') return consent >= 4 && objections <= 1 && !hardObjection;
  if (proposal.mode === 'carry-difference') return consent >= 3 && objections <= 2;
  return consent >= 3 && objections <= 2 && !hardObjection;
}

export function bestAutonomousProposal(state: SimulationState, proposals: CivicProposal[]): CivicProposal | undefined {
  const repeatedMode = state.works.at(-1)?.mode;
  const scored = proposals.map((proposal) => {
    const values = Object.values(proposal.support);
    const average = mean(values);
    const floor = Math.min(...values);
    const underheardAuthors = mean(
      proposal.authors.map((id) => 1 / (1 + (state.voices.find((voice) => voice.id === id)?.attention ?? 0))),
    );
    const passes = proposalHasConsent(proposal) ? 0.34 : 0;
    const novelty = proposal.mode === repeatedMode ? -0.12 : 0.08;
    const repair = (1 - state.qualities[proposal.focus]) * 0.1;
    return { proposal, score: passes + average * 0.42 + floor * 0.2 + underheardAuthors * 0.15 + novelty + repair };
  });
  scored.sort((a, b) => b.score - a.score || a.proposal.id.localeCompare(b.proposal.id));
  return scored[0]?.proposal;
}
