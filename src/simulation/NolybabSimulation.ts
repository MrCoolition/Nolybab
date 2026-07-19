import {
  COUNCIL_FORMS,
  DIRECTORS,
  DIRECTOR_BY_ID,
  EPOCH_NAMES,
  LESSON_HALVES,
  QUALITY_META,
  VOICES,
  VOICE_BY_ID,
} from './content';
import {
  bestAutonomousPair,
  bestAutonomousProposal,
  generateCouncilProposals,
  generateQuestion,
  initialDirectors,
  proposalHasConsent,
  stepGamemasters,
} from './gamemasters';
import {
  createInitialAgency,
  getActionAffordances as actionAffordances,
  normalizeAgencyState,
  performCivicAction as resolvePlayerAction,
  previewCivicAction as previewPlayerAction,
  stepAgencyWorld,
} from './agency';
import { clamp, hashString, lerp, mean, normalizedDifference, SeededRandom } from './random';
import { QUALITY_KEYS } from './types';
import type {
  ArtGeometry,
  ArtMotion,
  ArtMotif,
  CivicProposal,
  CivicActionAffordance,
  CivicActionInput,
  CivicActionPreview,
  CivicActionResult,
  CivicTargetRef,
  CivicWork,
  CivicWorkKind,
  CouncilSession,
  DirectorId,
  EpochLaw,
  Lesson,
  MemoryEntry,
  NanoCouncilDirection,
  NanoArrivalDirection,
  NanoCivicDirection,
  PersistedSimulation,
  ProceduralArtDirection,
  ProposalMode,
  QualityKey,
  QualityMap,
  RelationshipState,
  SharedWord,
  SimulationSnapshot,
  SimulationState,
  SpatialPoint,
  VoiceId,
  VoiceState,
  WeaveOutcome,
} from './types';

const STORAGE_KEY = 'nolybab.living-simulation.v1';
const SAVE_INTERVAL_SECONDS = 12;
const DIRECTOR_STEP_SECONDS = 1;
const COUNCIL_SECONDS = 16;
const AUTONOMOUS_COUNCIL_SECONDS = 3.5;
const DECISION_SECONDS = 20;
const AUTONOMOUS_DECISION_SECONDS = 2.5;
const ACTION_SECONDS = 4.2;
const GROWTH_SECONDS = 5.2;

type SnapshotListener = (snapshot: SimulationSnapshot) => void;
type OutcomeListener = (outcome: WeaveOutcome) => void;
type CivicActionListener = (result: CivicActionResult) => void;

const REFRAME_HOOKS: Record<QualityKey, readonly { title: string; text: string }[]> = {
  coherence: [
    { title: 'Leave one word untranslated', text: 'Future coordination gains strength when the chosen voices remain meaningfully different.' },
    { title: 'Minimum viable agreement', text: 'The chorus may act together without pretending to share every reason.' },
  ],
  plurality: [
    { title: 'Carry the dissent', text: 'An underheard voice gains extra force whenever harmony becomes too easy.' },
    { title: 'The right to remain strange', text: 'Difference now produces coherence when it is deliberately protected.' },
  ],
  reciprocity: [
    { title: 'Return the weight', text: 'Every successful weave must feed attention back toward those carrying its hidden cost.' },
    { title: 'Care asks permission', text: 'Helpful answers become stronger when they preserve authorship.' },
  ],
  biosphere: [
    { title: 'Ask the living', text: 'Ecological consequence becomes a participant in every future synthesis.' },
    { title: 'The river has standing', text: 'Human coherence cannot rise by exporting silence into the biosphere.' },
  ],
  agency: [
    { title: 'Right to pause', text: 'No urgent question may erase the time needed for meaningful refusal.' },
    { title: 'Prediction is not permission', text: 'Automated choices preserve a larger opening for human redirection.' },
  ],
  wonder: [
    { title: 'Protect the useless', text: 'Unoptimized attention now increases the civilization’s capacity to adapt.' },
    { title: 'Invite a third possibility', text: 'A resolved binary may still bud an unrequested meaning.' },
  ],
};

function initialQualities(rng: SeededRandom): QualityMap {
  return {
    coherence: 0.42 + rng.between(-0.04, 0.04),
    plurality: 0.67 + rng.between(-0.04, 0.04),
    reciprocity: 0.51 + rng.between(-0.04, 0.04),
    biosphere: 0.56 + rng.between(-0.04, 0.04),
    agency: 0.61 + rng.between(-0.04, 0.04),
    wonder: 0.64 + rng.between(-0.04, 0.04),
  };
}

function initialVoices(rng: SeededRandom): VoiceState[] {
  return VOICES.map((voice, index) => ({
    id: voice.id,
    attention: rng.between(0.12, 0.4),
    presence: 0.42 + rng.between(-0.07, 0.07),
    cadence: rng.between(0.72, 1.28),
    lastHeard: -index * 0.5,
    mutations: 0,
  }));
}

function initialRelationships(rng: SeededRandom): RelationshipState[] {
  const relationships: RelationshipState[] = [];
  for (let left = 0; left < VOICES.length; left += 1) {
    for (let right = left + 1; right < VOICES.length; right += 1) {
      const circularDistance = Math.min(right - left, VOICES.length - (right - left));
      relationships.push({
        a: VOICES[left]?.id ?? 'pioneers',
        b: VOICES[right]?.id ?? 'innovators',
        strength: clamp(0.08 + (4 - circularDistance) * 0.045 + rng.between(-0.035, 0.045), 0.04, 0.34),
        tension: rng.between(0.18, 0.48),
        exchanges: 0,
      });
    }
  }
  return relationships;
}

function qualityExtremes(qualities: QualityMap): { strongest: QualityKey; weakest: QualityKey } {
  const strongest = QUALITY_KEYS.reduce((highest, quality) => (qualities[quality] > qualities[highest] ? quality : highest));
  const weakest = QUALITY_KEYS.reduce((lowest, quality) => (qualities[quality] < qualities[lowest] ? quality : lowest));
  return { strongest, weakest };
}

function pairKey(a: VoiceId, b: VoiceId): string {
  return [a, b].sort().join(':');
}

const PROPOSAL_MODES: readonly ProposalMode[] = ['shared-minimum', 'carry-difference', 'reversible-trial'];
const WORK_KINDS: readonly CivicWorkKind[] = [
  'shared-word',
  'listening-ritual',
  'consent-protocol',
  'memory-practice',
  'ecological-covenant',
  'open-question',
  'witness-circle',
  'translation-braid',
];
const ART_MOTIFS: readonly ArtMotif[] = ['braid', 'ring', 'scar', 'current', 'constellation', 'threshold', 'mycelium'];
const ART_GEOMETRIES: readonly ArtGeometry[] = ['radial', 'braided', 'branching', 'orbital', 'layered'];
const ART_MOTIONS: readonly ArtMotion[] = ['breathe', 'drift', 'pulse', 'ripple', 'still'];

function safeText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length === 0 || clean.length > maximum) return null;
  return clean;
}

function safeArt(
  value: unknown,
  fallback: ProceduralArtDirection,
): ProceduralArtDirection | null {
  if (typeof value === 'string') {
    const texture = safeText(value, 120);
    return texture ? { ...fallback, texture } : null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<ProceduralArtDirection>;
  const motif = candidate.motif ?? fallback.motif;
  const geometry = candidate.geometry ?? fallback.geometry;
  const motion = candidate.motion ?? fallback.motion;
  if (!ART_MOTIFS.includes(motif) || !ART_GEOMETRIES.includes(geometry) || !ART_MOTIONS.includes(motion)) return null;
  const palette = candidate.palette ?? fallback.palette;
  if (
    !Array.isArray(palette) ||
    palette.length < 2 ||
    palette.length > 5 ||
    palette.some((color) => typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))
  ) return null;
  const texture = candidate.texture === undefined ? fallback.texture : safeText(candidate.texture, 120);
  const caption = candidate.caption === undefined ? fallback.caption : safeText(candidate.caption, 100);
  if (!texture || !caption) return null;
  const density = candidate.density === undefined ? fallback.density : Number(candidate.density);
  const symmetry = candidate.symmetry === undefined ? fallback.symmetry : Number(candidate.symmetry);
  if (!Number.isFinite(density) || !Number.isFinite(symmetry)) return null;
  return {
    motif,
    geometry,
    motion,
    palette: [...palette],
    density: clamp(density, 0.08, 0.94),
    symmetry: clamp(symmetry, 0, 1),
    texture,
    caption,
  };
}

export class NolybabSimulation {
  private state: SimulationState;
  private rng: SeededRandom;
  private snapshotListeners = new Set<SnapshotListener>();
  private outcomeListeners = new Set<OutcomeListener>();
  private civicActionListeners = new Set<CivicActionListener>();
  private emitAccumulator = 0;
  private saveAccumulator = 0;
  private directorAccumulator = 0;

  constructor(seedPhrase: string, restoredState?: SimulationState) {
    if (restoredState) {
      this.state = restoredState;
      this.rng = new SeededRandom(restoredState.rngState);
      this.normalizeRestoredState();
    } else {
      const cleanPhrase = this.cleanSeedPhrase(seedPhrase);
      const seed = hashString(`${cleanPhrase.toLowerCase()}::reverse-babylon`);
      this.rng = new SeededRandom(seed);
      this.state = this.createInitialState(cleanPhrase, seed);
      this.state.currentQuestion = generateQuestion(this.state, this.rng);
      this.syncRandomState();
    }
  }

  static hasSavedWorld(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  }

  static load(): NolybabSimulation | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const persisted = JSON.parse(raw) as PersistedSimulation;
      if (!persisted.state || persisted.state.version !== 1) return null;
      return new NolybabSimulation(persisted.state.seedPhrase, persisted.state);
    } catch {
      return null;
    }
  }

  get snapshot(): SimulationSnapshot {
    return this.state;
  }

  subscribe(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    listener(this.state);
    return () => this.snapshotListeners.delete(listener);
  }

  onOutcome(listener: OutcomeListener): () => void {
    this.outcomeListeners.add(listener);
    return () => this.outcomeListeners.delete(listener);
  }

  onCivicAction(listener: CivicActionListener): () => void {
    this.civicActionListeners.add(listener);
    return () => this.civicActionListeners.delete(listener);
  }

  reseed(seedPhrase: string): void {
    const cleanPhrase = this.cleanSeedPhrase(seedPhrase);
    const seed = hashString(`${cleanPhrase.toLowerCase()}::reverse-babylon`);
    this.rng = new SeededRandom(seed);
    this.state = this.createInitialState(cleanPhrase, seed);
    this.state.currentQuestion = generateQuestion(this.state, this.rng);
    this.syncRandomState();
    this.save();
    this.emit();
  }

  update(realSeconds: number): void {
    if (this.state.paused) return;
    const seconds = Math.min(0.25, Math.max(0, realSeconds)) * this.state.speed;
    if (seconds === 0) return;

    this.state.elapsed += seconds;
    this.emitAccumulator += seconds;
    this.saveAccumulator += seconds;
    this.directorAccumulator += seconds;

    this.stepCivicPhase(seconds);

    while (this.directorAccumulator >= DIRECTOR_STEP_SECONDS) {
      this.directorAccumulator -= DIRECTOR_STEP_SECONDS;
      stepGamemasters(this.state, this.rng);
      this.stepCivicDrift();
      for (const event of stepAgencyWorld(this.state, this.rng, DIRECTOR_STEP_SECONDS)) {
        this.addMemory(event.kind === 'breach' ? 'mistake' : 'birth', event.title, event.detail);
      }
      this.syncRandomState();
    }

    if (this.emitAccumulator >= 0.25) {
      this.emitAccumulator = 0;
      this.emit();
    }
    if (this.saveAccumulator >= SAVE_INTERVAL_SECONDS) {
      this.saveAccumulator = 0;
      this.save();
    }
  }

  setPaused(paused: boolean): void {
    this.state.paused = paused;
    this.emit();
    this.save();
  }

  setSpeed(speed: 1 | 2 | 4): void {
    this.state.speed = speed;
    this.emit();
    this.save();
  }

  challengeDirector(id: DirectorId): boolean {
    const question = this.state.currentQuestion;
    if (!question || question.tags.includes(`challenged:${id}`)) return false;
    const director = this.state.directors.find((candidate) => candidate.id === id);
    if (!director) return false;

    question.tags.push(`challenged:${id}`);
    director.influence = clamp(director.influence - 0.12, 0.08, 1);
    director.appetite = clamp(director.appetite + 0.07, 0, 1);
    director.thought = 'My framing has been challenged. Recalculating without retreating.';
    this.state.qualities.agency = clamp(this.state.qualities.agency + 0.012);

    if (question.director === id) {
      question.pressure = clamp(question.pressure - 0.07, 0.2, 1);
      question.prompt = `${question.prompt} The author of this question has been challenged.`;
    } else {
      question.needs[DIRECTOR_BY_ID[id].quality] = Math.max(question.needs[DIRECTOR_BY_ID[id].quality], 0.5);
    }

    this.addMemory('birth', `${DIRECTOR_BY_ID[id].name} was challenged`, 'The framing changed, but the gamemaster remained in the conversation.');
    this.save();
    this.emit();
    return true;
  }

  /** Truthful action availability for a spatial target. No narrative model is consulted. */
  getActionAffordances(target?: CivicTargetRef): CivicActionAffordance[] {
    return actionAffordances(this.state, target);
  }

  /** Deterministic preview: same state + same input always exposes the same costs and odds. */
  previewCivicAction(input: CivicActionInput): CivicActionPreview {
    return previewPlayerAction(this.state, input);
  }

  /**
   * Executes a player-authored verb/domain/method/target composition. This is
   * the primary game action; councils remain as a backwards-compatible path.
   */
  performCivicAction(input: CivicActionInput): CivicActionResult | null {
    if (this.state.civicPhase === 'action' || this.state.civicPhase === 'growth') return null;
    const result = resolvePlayerAction(this.state, input, this.rng);
    if (!result) return null;

    this.state.council = null;
    this.state.currentQuestion = null;
    this.state.civicPhase = 'action';
    this.state.actionSeconds = ACTION_SECONDS;
    this.state.interludeSeconds = ACTION_SECONDS;
    this.state.cycle += 1;
    this.state.resolvedQuestions += 1;
    this.state.lastPair = input.ally ? [input.lead, input.ally] : this.state.lastPair;
    const heard = [input.lead, input.ally].filter(Boolean) as VoiceId[];
    for (const voiceId of heard) {
      const voice = this.state.voices.find((candidate) => candidate.id === voiceId);
      if (!voice) continue;
      voice.attention += 0.58 / heard.length;
      voice.lastHeard = this.state.elapsed;
      voice.mutations += 1;
    }
    this.addMemory(
      result.outcome === 'ruptured' ? 'mistake' : 'birth',
      result.summary,
      `${input.verb} was authored at ${result.input.target.kind}:${result.input.target.id}. ${result.sideEffects[0] ?? 'The world carries the consequence forward.'}`,
    );
    this.checkEpochTransition();
    this.syncRandomState();
    this.save();
    this.emit();
    for (const listener of this.civicActionListeners) listener(result);
    return result;
  }

  /** Spend attention to stop an expiring autonomous council and reopen authorship. */
  interruptAutonomy(targetPressureId: string): boolean {
    const pressure = this.state.agency.pressures.find((candidate) => candidate.id === targetPressureId);
    if (!pressure || pressure.state === 'transformed' || this.state.agency.resources.attention < 4) return false;
    this.state.agency.resources.attention -= 4;
    pressure.timeToBreach += 14;
    pressure.severity = clamp(pressure.severity - 0.025);
    if (this.state.council?.autonomous) {
      this.state.council = null;
      this.state.civicPhase = 'pressure';
      if (this.state.currentQuestion) this.state.currentQuestion.secondsLeft = Math.max(24, this.state.currentQuestion.secondsLeft);
    }
    this.state.qualities.agency = clamp(this.state.qualities.agency + 0.012);
    this.addMemory('birth', 'Autonomy was interrupted', `The player reopened ${pressure.title} before the world could choose by default.`);
    this.save();
    this.emit();
    return true;
  }

  reshapePressure(
    pressureId: string,
    destination: SpatialPoint,
    lead: VoiceId,
  ): CivicActionResult | null {
    return this.performCivicAction({
      domain: 'habitat',
      verb: 'reroute',
      method: 'prototype',
      target: { kind: 'pressure', id: pressureId },
      lead,
      intensity: 2,
      destination,
    });
  }

  conveneCouncil(voices: [VoiceId, VoiceId], lessonId?: string, autonomous = false): CouncilSession | null {
    const question = this.state.currentQuestion;
    if (this.state.civicPhase !== 'pressure' || !question || voices[0] === voices[1]) return null;
    if (!VOICE_BY_ID[voices[0]] || !VOICE_BY_ID[voices[1]]) return null;
    const selectedLesson = lessonId
      ? this.state.lessons.find((lesson) => lesson.id === lessonId && !lesson.resolved)
      : undefined;
    const proposals = generateCouncilProposals(this.state, voices, selectedLesson, this.rng);
    if (proposals.length !== 3) return null;
    const heardVoices = [...voices];
    if (autonomous) {
      const witness = [...this.state.voices]
        .filter((voice) => !heardVoices.includes(voice.id))
        .sort((a, b) => a.attention - b.attention || a.id.localeCompare(b.id))[0];
      if (witness) heardVoices.push(witness.id);
    }
    const council: CouncilSession = {
      id: `council-${this.state.epoch}-${this.state.cycle}-${this.rng.state.toString(16)}`,
      questionId: question.id,
      name: `Council of ${QUALITY_META[question.focus].label}`,
      phaseSeconds: autonomous ? AUTONOMOUS_COUNCIL_SECONDS : COUNCIL_SECONDS,
      autoBeatSeconds: 5,
      authors: voices,
      heardVoices,
      proposals,
      selectedProposalId: null,
      lessonId: selectedLesson?.id,
      autonomous,
    };
    this.state.council = council;
    this.state.civicPhase = 'council';
    question.secondsLeft = council.phaseSeconds;
    this.state.directors.find((director) => director.id === 'architect')!.thought =
      'Holding three unlike forms of agreement open without declaring one inevitable.';
    this.syncRandomState();
    this.save();
    this.emit();
    return council;
  }

  chooseProposal(id: string): boolean {
    const council = this.state.council;
    if (!council || (this.state.civicPhase !== 'council' && this.state.civicPhase !== 'decision')) return false;
    if (!council.proposals.some((proposal) => proposal.id === id)) return false;
    council.selectedProposalId = id;
    council.phaseSeconds = council.autonomous ? AUTONOMOUS_DECISION_SECONDS : DECISION_SECONDS;
    this.state.civicPhase = 'decision';
    if (this.state.currentQuestion) this.state.currentQuestion.secondsLeft = council.phaseSeconds;
    this.save();
    this.emit();
    return true;
  }

  enactCouncil(): WeaveOutcome | null {
    const council = this.state.council;
    if (!council || !this.state.currentQuestion) return null;
    if (this.state.civicPhase !== 'council' && this.state.civicPhase !== 'decision') return null;
    let proposal = council.proposals.find((candidate) => candidate.id === council.selectedProposalId);
    if (!proposal) {
      proposal = bestAutonomousProposal(this.state, council.proposals);
      if (!proposal) return null;
      council.selectedProposalId = proposal.id;
      council.autonomous = true;
    }
    return this.resolveWeave(proposal.authors, proposal.lessonId, council.autonomous, proposal);
  }

  cancelCouncil(): void {
    if (!this.state.council || (this.state.civicPhase !== 'council' && this.state.civicPhase !== 'decision')) return;
    this.state.council = null;
    this.state.civicPhase = 'pressure';
    if (this.state.currentQuestion) this.state.currentQuestion.secondsLeft = Math.max(8, this.state.currentQuestion.secondsLeft);
    this.save();
    this.emit();
  }

  applyNanoDirection(questionId: string, direction: NanoCouncilDirection): boolean {
    const council = this.state.council;
    if (!council || council.questionId !== questionId || this.state.currentQuestion?.id !== questionId) return false;
    if (this.state.civicPhase !== 'council' && this.state.civicPhase !== 'decision') return false;
    if (!direction || typeof direction !== 'object' || (direction.model && direction.model !== 'gpt-5.4-nano')) return false;
    if (!Array.isArray(direction.proposals) || direction.proposals.length !== 3) return false;

    const enriched: CivicProposal[] = [];
    const seen = new Set<ProposalMode>();
    for (const candidate of direction.proposals) {
      if (!candidate || !PROPOSAL_MODES.includes(candidate.mode) || seen.has(candidate.mode)) return false;
      const base = council.proposals.find((proposal) => proposal.mode === candidate.mode);
      if (!base) return false;
      const title = safeText(candidate.title, 96);
      const summary = safeText(candidate.summary, 260);
      const decision = safeText(candidate.decision, 320);
      const cost = safeText(candidate.cost, 180);
      const workKind = WORK_KINDS.includes(candidate.workKind as CivicWorkKind)
        ? (candidate.workKind as CivicWorkKind)
        : null;
      const art = safeArt(candidate.art, base.art);
      if (!title || !summary || !decision || !cost || !workKind || !art) return false;
      enriched.push({
        ...base,
        title,
        summary,
        decision,
        cost: { ...base.cost, description: cost },
        workKind,
        art,
        source: 'nano',
      });
      seen.add(candidate.mode);
    }

    const councilName = direction.councilName === undefined ? council.name : safeText(direction.councilName, 84);
    let voiceStatements = council.voiceStatements;
    let voicesLine = council.voicesLine;
    if (direction.voices !== undefined) {
      if (!Array.isArray(direction.voices) || direction.voices.length === 0 || direction.voices.length > VOICES.length) return false;
      const nextStatements: Partial<Record<VoiceId, string>> = {};
      const lines: string[] = [];
      for (const item of direction.voices) {
        if (!item || !VOICE_BY_ID[item.voiceId] || nextStatements[item.voiceId]) return false;
        const statement = safeText(item.statement, 220);
        if (!statement) return false;
        nextStatements[item.voiceId] = statement;
        lines.push(`${VOICE_BY_ID[item.voiceId].shortName}: ${statement}`);
      }
      voiceStatements = nextStatements;
      voicesLine = lines.join(' · ');
    }
    const worldLine = direction.worldLine === undefined ? council.worldLine : safeText(direction.worldLine, 240);
    if (!councilName || (direction.worldLine !== undefined && !worldLine)) return false;
    const illustration =
      direction.illustration === undefined
        ? council.illustration
        : safeArt(direction.illustration, enriched[0]?.art ?? council.proposals[0]!.art);
    if (direction.illustration !== undefined && !illustration) return false;

    const thoughtUpdates: Array<{ id: DirectorId; thought: string }> = [];
    if (direction.gamemasters !== undefined) {
      if (!direction.gamemasters || typeof direction.gamemasters !== 'object' || Array.isArray(direction.gamemasters)) return false;
      const illustrator = safeText(direction.gamemasters.illustrator, 220);
      const architect = safeText(direction.gamemasters.architect, 220);
      const storyweaver = safeText(direction.gamemasters.storyweaver, 220);
      if (!illustrator || !architect || !storyweaver) return false;
      thoughtUpdates.push(
        { id: 'illustrator', thought: illustrator },
        { id: 'architect', thought: architect },
        { id: 'storyweaver', thought: storyweaver },
      );
    }

    council.name = councilName;
    council.voicesLine = voicesLine ?? undefined;
    council.voiceStatements = voiceStatements;
    council.worldLine = worldLine ?? undefined;
    council.illustration = illustration ?? undefined;
    council.proposals = enriched;
    for (const update of thoughtUpdates) {
      const director = this.state.directors.find((candidate) => candidate.id === update.id);
      if (!director) continue;
      director.thought = update.thought;
    }
    this.addMemory('birth', `${council.name} found another language`, 'Nano enriched expression and art direction; deterministic consent and consequences remained unchanged.');
    this.save();
    this.emit();
    return true;
  }

  /**
   * Applies expression-only AI enrichment to an artifact created by a player
   * action. The action ID, artifact ID and revision must all match; mechanics,
   * resources, outcomes and pressure deltas cannot be changed by the model.
   */
  applyNanoCivicDirection(actionId: string, direction: NanoCivicDirection): boolean {
    if (!direction || typeof direction !== 'object') return false;
    if (direction.model && direction.model !== 'gpt-5.4-nano') return false;
    if (direction.actionId !== actionId || !Number.isInteger(direction.baseRevision) || direction.baseRevision < 0) return false;
    const record = this.state.agency.actionHistory.find((candidate) => candidate.id === actionId);
    if (!record || !record.createdIds.includes(direction.artifactId)) return false;

    const artifact = [
      ...this.state.agency.settlements,
      ...this.state.agency.inventions,
      ...this.state.agency.charterLaws,
      ...this.state.agency.cultures,
      ...this.state.agency.sites,
      ...this.state.agency.arrivals,
    ].find((candidate) => candidate.id === direction.artifactId);
    if (!artifact || artifact.originActionId !== actionId || artifact.revision !== direction.baseRevision) return false;

    const name = direction.name === undefined ? undefined : safeText(direction.name, 72);
    const description = direction.description === undefined ? undefined : safeText(direction.description, 360);
    const worldLine = direction.worldLine === undefined ? undefined : safeText(direction.worldLine, 260);
    const visualDirection = direction.visualDirection === undefined
      ? undefined
      : safeArt(direction.visualDirection, artifact.visualDirection);
    if (
      (direction.name !== undefined && !name) ||
      (direction.description !== undefined && !description) ||
      (direction.worldLine !== undefined && !worldLine) ||
      (direction.visualDirection !== undefined && !visualDirection) ||
      (name === undefined && description === undefined && worldLine === undefined && visualDirection === undefined)
    ) return false;

    if (name) {
      if ('name' in artifact) artifact.name = name;
      else artifact.title = name;
    }
    if (description) artifact.description = description;
    if (visualDirection) artifact.visualDirection = visualDirection;
    artifact.source = 'nano-enriched';
    artifact.revision += 1;
    if (worldLine) this.state.agency.nanoWorldLines[actionId] = worldLine;
    this.addMemory(
      'synthesis',
      `${'name' in artifact ? artifact.name : artifact.title} found a visual language`,
      worldLine ?? description ?? 'The Illustrator made the player-authored consequence more legible without altering its mechanics.',
    );
    this.save();
    this.emit();
    return true;
  }

  /** Revision-guarded AI naming and illustration for an arrival already generated by the world. */
  applyNanoArrivalDirection(arrivalId: string, baseRevision: number, direction: NanoArrivalDirection): boolean {
    if (!direction || typeof direction !== 'object' || !Number.isInteger(baseRevision) || baseRevision < 0) return false;
    if (direction.model && direction.model !== 'gpt-5.4-nano') return false;
    const arrival = this.state.agency.arrivals.find((candidate) => candidate.id === arrivalId);
    if (!arrival || arrival.revision !== baseRevision) return false;
    const name = direction.name === undefined ? undefined : safeText(direction.name, 72);
    const description = direction.description === undefined ? undefined : safeText(direction.description, 360);
    const traits = direction.traits === undefined
      ? undefined
      : Array.isArray(direction.traits) && direction.traits.length <= 8
        ? direction.traits.map((trait) => safeText(trait, 32))
        : null;
    const visualDirection = direction.visualDirection === undefined
      ? undefined
      : safeArt(direction.visualDirection, arrival.visualDirection);
    if (
      (direction.name !== undefined && !name) ||
      (direction.description !== undefined && !description) ||
      (direction.traits !== undefined && (!traits || traits.some((trait) => !trait))) ||
      (direction.visualDirection !== undefined && !visualDirection) ||
      (!name && !description && !traits && !visualDirection)
    ) return false;

    if (name) arrival.name = name;
    if (description) arrival.description = description;
    if (traits) arrival.traits = [...new Set([...arrival.traits, ...(traits as string[])])].slice(-12);
    if (visualDirection) arrival.visualDirection = visualDirection;
    arrival.source = 'nano-enriched';
    arrival.revision += 1;
    this.addMemory('birth', `${arrival.name} became legible at the horizon`, arrival.description);
    this.save();
    this.emit();
    return true;
  }

  /** Backward-compatible one-step weave used by the existing HUD. */
  weave(voices: [VoiceId, VoiceId], lessonId?: string, autonomous = false): WeaveOutcome | null {
    if (this.state.civicPhase !== 'pressure') return null;
    const council = this.conveneCouncil(voices, lessonId, autonomous);
    if (!council) return null;
    const proposal = bestAutonomousProposal(this.state, council.proposals) ?? council.proposals[0];
    if (!proposal || !this.chooseProposal(proposal.id)) return null;
    return this.enactCouncil();
  }

  private resolveWeave(
    voices: [VoiceId, VoiceId],
    lessonId: string | undefined,
    autonomous: boolean,
    proposal: CivicProposal,
  ): WeaveOutcome | null {
    const question = this.state.currentQuestion;
    if (!question || voices[0] === voices[1]) return null;
    const authorId = question.director;
    const [aId, bId] = voices;
    const a = VOICE_BY_ID[aId];
    const b = VOICE_BY_ID[bId];
    if (!a || !b) return null;

    const relationship = this.relationship(aId, bId);
    const selectedLesson = lessonId ? this.state.lessons.find((lesson) => lesson.id === lessonId && !lesson.resolved) : undefined;
    const needsTotal = QUALITY_KEYS.reduce((sum, quality) => sum + question.needs[quality], 0);
    const coverage = QUALITY_KEYS.reduce((sum, quality) => {
      const sharedCapacity = (a.affinities[quality] + b.affinities[quality]) * 0.34;
      const complementaryCapacity = Math.max(a.affinities[quality], b.affinities[quality]) * 0.32;
      return sum + question.needs[quality] * (sharedCapacity + complementaryCapacity);
    }, 0) / needsTotal;
    const contrast = mean(QUALITY_KEYS.map((quality) => Math.abs(a.affinities[quality] - b.affinities[quality])));
    const voiceStates = voices.map((id) => this.state.voices.find((voice) => voice.id === id));
    const underheard = mean(voiceStates.map((voice) => (voice ? 1 / (1 + voice.attention) : 0.5)));
    const repeatedPair = this.state.lastPair && pairKey(...this.state.lastPair) === pairKey(aId, bId);
    const lessonMatches = selectedLesson && (selectedLesson.focus === question.focus || selectedLesson.tags.some((tag) => question.tags.includes(tag)));
    const matchingLaws = this.state.laws.filter((law) => law.neglected === question.focus || law.strongest === question.focus).length;
    const form = COUNCIL_FORMS[proposal.mode];
    const matchingWorks = this.state.works.filter((work) => work.status === 'living' && work.focus === question.focus);
    const workEcho = Math.min(0.08, matchingWorks.reduce((sum, work) => sum + work.resonance * 0.012, 0));

    const probability = clamp(
      0.19 +
        coverage * 0.48 +
        contrast * 0.34 +
        relationship.strength * 0.16 +
        underheard * 0.08 +
        (lessonMatches ? 0.16 + selectedLesson.depth * 0.018 : 0) +
        Math.min(0.08, matchingLaws * 0.012) +
        form.successModifier +
        workEcho -
        question.pressure * 0.2 -
        (repeatedPair ? 0.1 : 0) -
        (autonomous ? 0.025 : 0),
      0.2,
      0.91,
    );

    const consented = proposalHasConsent(proposal);
    const succeeded = consented && this.rng.next() <= probability;
    let outcome: WeaveOutcome;

    if (succeeded && selectedLesson) {
      outcome = this.applyReframe(question.focus, voices, selectedLesson, probability, autonomous, proposal.mode);
    } else if (succeeded) {
      outcome = this.applySynthesis(question.focus, voices, probability, autonomous, proposal.mode);
    } else {
      outcome = this.applyProductiveMistake(question.focus, voices, probability, autonomous, selectedLesson, proposal.mode);
      if (!consented) {
        outcome.account = `The council would not erase its objections to “${proposal.title}.” Refusal becomes a visible civic fact, not an ignored vote. ${outcome.account}`;
      }
    }

    outcome.proposalId = proposal.id;
    this.state.qualities[proposal.cost.quality] = clamp(
      this.state.qualities[proposal.cost.quality] - proposal.cost.amount,
      0.06,
      0.98,
    );

    relationship.exchanges += 1;
    const strengthGain = proposal.mode === 'shared-minimum' ? 0.075 : proposal.mode === 'carry-difference' ? 0.058 : 0.048;
    relationship.strength = clamp(relationship.strength + (succeeded ? strengthGain : 0.035));
    const heldDissent = proposal.mode === 'carry-difference' && succeeded ? 0.018 : 0;
    relationship.tension = clamp(
      relationship.tension + (contrast - 0.24) * 0.08 - (succeeded ? 0.025 : -0.015) + heldDissent,
    );
    this.hearVoices(voices, succeeded);

    this.state.lastPair = voices;
    this.state.resolvedQuestions += 1;
    if (autonomous) this.state.autonomousResponses += 1;
    const objections = Object.values(proposal.positions).filter((position) => position === 'object').length;
    if (autonomous && succeeded && objections > 0 && proposal.mode !== 'carry-difference') {
      this.state.coerciveAutonomousResponses += 1;
    }
    this.state.cycle += 1;
    const work = this.createCivicWork(proposal, outcome, succeeded);
    outcome.workId = work.id;
    if (this.state.council) {
      this.state.council.pendingWork = work;
      this.state.council.outcome = outcome;
    }
    this.state.currentQuestion = null;
    this.state.civicPhase = 'action';
    this.state.actionSeconds = ACTION_SECONDS;
    this.state.interludeSeconds = ACTION_SECONDS;

    this.adaptDirectors(outcome, authorId);
    this.checkEpochTransition();
    const illustrator = this.state.directors.find((director) => director.id === 'illustrator');
    if (illustrator) illustrator.thought = `Giving “${proposal.title}” a footprint that can keep changing.`;
    this.syncRandomState();
    this.save();
    this.emit();
    for (const listener of this.outcomeListeners) listener(outcome);
    return outcome;
  }

  save(): void {
    try {
      const persisted: PersistedSimulation = { state: this.state, savedAt: Date.now() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // The simulation continues without persistence when storage is unavailable.
    }
  }

  clearSave(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // No-op in privacy-restricted contexts.
    }
  }

  private createInitialState(seedPhrase: string, seed: number): SimulationState {
    const agency = createInitialAgency({ elapsed: 0, seedPhrase }, this.rng);
    const state: SimulationState = {
      version: 1,
      seedPhrase,
      seed,
      rngState: this.rng.state,
      elapsed: 0,
      cycle: 0,
      epoch: 0,
      epochName: EPOCH_NAMES[0],
      paused: false,
      speed: 1,
      qualities: initialQualities(this.rng),
      voices: initialVoices(this.rng),
      relationships: initialRelationships(this.rng),
      directors: initialDirectors(this.rng),
      knobs: {
        dissonance: 0.42,
        ecologicalPressure: 0.46,
        memoryPressure: 0.18,
        novelty: 0.58,
        convergence: 0.28,
      },
      civicPhase: 'pressure',
      council: null,
      works: [],
      archivedWorkCount: 0,
      actionSeconds: 0,
      currentQuestion: null,
      interludeSeconds: 0,
      lessons: [],
      lexicon: [],
      laws: [],
      history: [],
      resolvedQuestions: 0,
      autonomousResponses: 0,
      coerciveAutonomousResponses: 0,
      lastPair: null,
      agency,
    };
    this.state = state;
    this.addMemory('birth', `“${seedPhrase}” survived`, 'Seven partial truths gather around an empty center. No voice is asked to become the whole.');
    return state;
  }

  private normalizeRestoredState(): void {
    const hadCivicPhase = typeof (this.state as Partial<SimulationState>).civicPhase === 'string';
    this.state.paused = false;
    this.state.speed = this.state.speed ?? 1;
    this.state.rngState = this.state.rngState || this.state.seed;
    this.state.civicPhase = this.state.civicPhase ?? 'pressure';
    this.state.council = this.state.council ?? null;
    this.state.works = Array.isArray(this.state.works) ? this.state.works : [];
    this.state.archivedWorkCount = Number.isFinite(this.state.archivedWorkCount)
      ? Math.max(0, Math.floor(this.state.archivedWorkCount))
      : 0;
    this.state.actionSeconds = Number.isFinite(this.state.actionSeconds) ? Math.max(0, this.state.actionSeconds) : 0;
    this.state.coerciveAutonomousResponses = this.state.coerciveAutonomousResponses ?? 0;
    normalizeAgencyState(this.state, this.rng);

    // Version-one saves from before councils used `interludeSeconds` as their
    // only post-decision clock. Preserve that breath instead of immediately
    // dropping an old world into a fresh pressure.
    if (!hadCivicPhase && !this.state.currentQuestion && !this.state.council && this.state.interludeSeconds > 0) {
      this.state.civicPhase = 'growth';
      this.state.actionSeconds = this.state.interludeSeconds;
    }

    const restoredDirectorIds = new Set(this.state.directors.map((director) => director.id));
    if (restoredDirectorIds.size < DIRECTORS.length) {
      const migrationRng = new SeededRandom(hashString(`${this.state.seedPhrase}::eight-gamemasters`));
      for (const director of initialDirectors(migrationRng)) {
        if (!restoredDirectorIds.has(director.id)) this.state.directors.push(director);
      }
    }

    if (!this.state.currentQuestion && !this.state.council && this.state.interludeSeconds <= 0) {
      this.state.civicPhase = 'pressure';
      this.state.currentQuestion = generateQuestion(this.state, this.rng);
      this.syncRandomState();
    }
  }

  private cleanSeedPhrase(value: string): string {
    const clean = value.trim().replace(/\s+/g, ' ').slice(0, 48);
    return clean || 'the right to begin again';
  }

  private stepCivicPhase(seconds: number): void {
    if (this.state.civicPhase === 'pressure') {
      if (!this.state.currentQuestion) {
        this.state.currentQuestion = generateQuestion(this.state, this.rng);
        this.syncRandomState();
      }
      this.state.currentQuestion.secondsLeft = Math.max(0, this.state.currentQuestion.secondsLeft - seconds);
      if (this.state.currentQuestion.secondsLeft <= 0) {
        const pair = bestAutonomousPair(this.state);
        const lesson = this.bestMatchingLesson(this.state.currentQuestion.focus);
        this.conveneCouncil(pair, lesson?.id, true);
      }
      return;
    }

    if (this.state.civicPhase === 'council') {
      const council = this.state.council;
      if (!council) {
        this.state.civicPhase = 'pressure';
        return;
      }
      council.phaseSeconds = Math.max(0, council.phaseSeconds - seconds);
      council.autoBeatSeconds -= seconds;
      if (this.state.currentQuestion) this.state.currentQuestion.secondsLeft = council.phaseSeconds;
      if (council.autoBeatSeconds <= 0) {
        council.autoBeatSeconds += 5;
        const witness = [...this.state.voices]
          .filter((voice) => !council.heardVoices.includes(voice.id))
          .sort((a, b) => a.attention - b.attention || a.id.localeCompare(b.id))[0];
        if (witness) {
          council.heardVoices.push(witness.id);
          witness.attention += 0.08;
          witness.lastHeard = this.state.elapsed;
        }
      }
      if (council.phaseSeconds <= 0) {
        const proposal = bestAutonomousProposal(this.state, council.proposals) ?? council.proposals[0];
        council.autonomous = true;
        if (proposal) this.chooseProposal(proposal.id);
      }
      return;
    }

    if (this.state.civicPhase === 'decision') {
      const council = this.state.council;
      if (!council) {
        this.state.civicPhase = 'pressure';
        return;
      }
      council.phaseSeconds = Math.max(0, council.phaseSeconds - seconds);
      if (this.state.currentQuestion) this.state.currentQuestion.secondsLeft = council.phaseSeconds;
      if (council.phaseSeconds <= 0) {
        council.autonomous = true;
        this.enactCouncil();
      }
      return;
    }

    this.state.actionSeconds = Math.max(0, this.state.actionSeconds - seconds);
    this.state.interludeSeconds = this.state.actionSeconds;
    if (this.state.actionSeconds > 0) return;

    if (this.state.civicPhase === 'action') {
      this.commitCouncilGrowth();
      this.state.civicPhase = 'growth';
      this.state.actionSeconds = GROWTH_SECONDS + (this.state.resolvedQuestions % 9 === 0 ? 3.8 : 0);
      this.state.interludeSeconds = this.state.actionSeconds;
      this.save();
      this.emit();
      return;
    }

    if (this.state.civicPhase === 'growth') {
      this.state.council = null;
      this.state.civicPhase = 'pressure';
      this.state.actionSeconds = 0;
      this.state.interludeSeconds = 0;
      this.state.currentQuestion = generateQuestion(this.state, this.rng);
      this.syncRandomState();
      this.save();
      this.emit();
    }
  }

  private commitCouncilGrowth(): void {
    const incoming = this.state.council?.pendingWork;
    if (!incoming || this.state.works.some((work) => work.id === incoming.id)) return;

    for (const work of this.state.works) {
      if (work.focus !== incoming.focus || work.status === 'composted') continue;
      work.echoes += 1;
      work.maturity = clamp(work.maturity + (work.status === 'living' ? 0.075 : 0.045));
      work.resonance = clamp(work.resonance + (incoming.mode === work.mode ? 0.025 : 0.045), 0.08, 0.98);
      if (work.maturity >= 0.56 && work.participants.length < 3) {
        const invited = [...this.state.voices]
          .filter((voice) => !work.participants.includes(voice.id))
          .sort((a, b) => a.attention - b.attention || a.id.localeCompare(b.id))[0];
        if (invited) {
          for (const participant of work.participants) {
            const relationship = this.relationship(invited.id, participant);
            relationship.strength = clamp(relationship.strength + 0.018);
            relationship.exchanges += 1;
          }
          work.participants.push(invited.id);
          invited.mutations += 1;
        }
      }
      if (work.status === 'contested' && work.maturity >= 0.7) work.status = 'living';
    }

    this.state.works.push(incoming);
    if (this.state.works.length > 96) {
      const archived = this.state.works.length - 96;
      this.state.works.splice(0, archived);
      this.state.archivedWorkCount += archived;
    }
    for (const participant of incoming.participants) {
      const voice = this.state.voices.find((candidate) => candidate.id === participant);
      if (voice) voice.mutations += 1;
    }
    this.addMemory(
      incoming.status === 'contested' ? 'mistake' : 'birth',
      `${incoming.title} became civic terrain`,
      'Growth appears as a durable relationship, practice, and visible meaning—not territory or inventory.',
    );
    if (this.state.council) this.state.council.pendingWork = undefined;
  }

  private stepCivicDrift(): void {
    const relationshipMean = mean(this.state.relationships.map((relationship) => relationship.strength));
    const attentionSpread = normalizedDifference(this.state.voices.map((voice) => voice.attention + 1));
    const coerciveAutonomyRatio = this.state.coerciveAutonomousResponses / Math.max(1, this.state.resolvedQuestions);

    this.state.qualities.coherence = lerp(this.state.qualities.coherence, clamp(0.28 + relationshipMean * 0.66), 0.0018);
    this.state.qualities.plurality = lerp(this.state.qualities.plurality, clamp(0.8 - attentionSpread * 0.78), 0.0022);
    this.state.qualities.reciprocity = lerp(
      this.state.qualities.reciprocity,
      clamp(0.38 + (1 - attentionSpread) * 0.3 + relationshipMean * 0.22),
      0.0014,
    );
    this.state.qualities.biosphere = clamp(
      this.state.qualities.biosphere +
        Math.sin(this.state.elapsed / 38 + this.state.seed * 0.00001) * 0.00018 -
        Math.max(0, this.state.knobs.convergence - 0.7) * 0.00022,
      0.08,
      0.96,
    );
    this.state.qualities.agency = lerp(this.state.qualities.agency, clamp(0.66 - coerciveAutonomyRatio * 0.2), 0.0012);
    this.state.qualities.wonder = clamp(
      this.state.qualities.wonder + (this.state.knobs.novelty - 0.5) * 0.00026 - (this.state.lastPair ? 0.000018 : 0),
      0.08,
      0.96,
    );

    for (const voice of this.state.voices) {
      const underheard = 1 / (1 + voice.attention);
      voice.presence = lerp(voice.presence, clamp(0.34 + underheard * 0.36 + voice.mutations * 0.018, 0.22, 0.94), 0.006);
      voice.cadence = clamp(voice.cadence + this.rng.between(-0.004, 0.004), 0.62, 1.42);
      voice.attention = Math.max(0.08, voice.attention * 0.9996);
    }

    for (const relationship of this.state.relationships) {
      relationship.tension = lerp(relationship.tension, this.state.knobs.dissonance, 0.0009);
    }
  }

  private relationship(a: VoiceId, b: VoiceId): RelationshipState {
    const relationship = this.state.relationships.find(
      (candidate) => (candidate.a === a && candidate.b === b) || (candidate.a === b && candidate.b === a),
    );
    if (!relationship) throw new Error(`Missing relationship between ${a} and ${b}`);
    return relationship;
  }

  private hearVoices(voices: [VoiceId, VoiceId], succeeded: boolean): void {
    for (const voice of this.state.voices) {
      if (voices.includes(voice.id)) {
        voice.attention += 1;
        voice.presence = clamp(voice.presence + (succeeded ? 0.035 : 0.052), 0.2, 1);
        voice.lastHeard = this.state.elapsed;
      } else {
        voice.presence = clamp(voice.presence - 0.0025, 0.2, 1);
      }
    }
  }

  private applySynthesis(
    focus: QualityKey,
    voices: [VoiceId, VoiceId],
    probability: number,
    autonomous: boolean,
    mode: ProposalMode,
  ): WeaveOutcome {
    const a = VOICE_BY_ID[voices[0]];
    const b = VOICE_BY_ID[voices[1]];
    this.changeQualities(focus, voices, true, autonomous, mode);
    const sharedWord = this.createSharedWord(focus, voices);
    this.state.lexicon.push(sharedWord);
    if (this.state.lexicon.length > 140) this.state.lexicon.splice(0, this.state.lexicon.length - 140);

    const account = `${a.shortName} ${a.verb} ${a.gift}; ${b.shortName} ${b.verb} ${b.gift}. Neither interpretation wins. Their friction gives Nolybab a new shared word: ${sharedWord.word}.`;
    const outcome: WeaveOutcome = {
      id: `o-${this.state.cycle}-${this.rng.state.toString(16)}`,
      kind: 'synthesis',
      title: 'A third meaning takes root',
      account,
      voices,
      focus,
      autonomous,
      probability,
      sharedWord,
    };
    this.addMemory(autonomous ? 'autonomous' : 'synthesis', `${sharedWord.word} entered the commons`, sharedWord.meaning);
    return outcome;
  }

  private applyProductiveMistake(
    focus: QualityKey,
    voices: [VoiceId, VoiceId],
    probability: number,
    autonomous: boolean,
    attemptedLesson?: Lesson,
    mode: ProposalMode = 'carry-difference',
  ): WeaveOutcome {
    const a = VOICE_BY_ID[voices[0]];
    const b = VOICE_BY_ID[voices[1]];
    this.changeQualities(focus, voices, false, autonomous, mode);
    const lesson = this.createLesson(focus, voices, attemptedLesson);
    this.state.lessons.push(lesson);
    if (this.state.lessons.length > 120) {
      const resolvedIndex = this.state.lessons.findIndex((candidate) => candidate.resolved);
      this.state.lessons.splice(resolvedIndex >= 0 ? resolvedIndex : 0, 1);
    }

    const account = attemptedLesson
      ? `${a.shortName} and ${b.shortName} carried “${attemptedLesson.title}” forward, but treated the old lesson as an answer instead of a sense. The new fracture deepens the Mountain without erasing the first.`
      : `${a.shortName} moved from ${a.gift}; ${b.shortName} answered from ${b.gift}. The weave privileged one cost it could not yet perceive. Nolybab keeps the fracture visible instead of reloading it away.`;
    const outcome: WeaveOutcome = {
      id: `o-${this.state.cycle}-${this.rng.state.toString(16)}`,
      kind: 'productive-mistake',
      title: lesson.title,
      account,
      voices,
      focus,
      autonomous,
      probability,
      lesson,
    };
    this.addMemory(autonomous ? 'autonomous' : 'mistake', lesson.title, lesson.account);
    return outcome;
  }

  private applyReframe(
    focus: QualityKey,
    voices: [VoiceId, VoiceId],
    lesson: Lesson,
    probability: number,
    autonomous: boolean,
    mode: ProposalMode,
  ): WeaveOutcome {
    const a = VOICE_BY_ID[voices[0]];
    const b = VOICE_BY_ID[voices[1]];
    this.changeQualities(focus, voices, true, autonomous, mode);
    lesson.resolved = true;
    lesson.depth += 1;
    const options = REFRAME_HOOKS[lesson.focus];
    const hook = options[mode === 'carry-difference' ? 0 : 1] ?? this.rng.pick(options);
    lesson.resolution = hook.text;
    const law: EpochLaw = {
      id: `law-${this.state.epoch}-${this.state.laws.length}-${this.rng.state.toString(16)}`,
      title: hook.title,
      text: hook.text,
      bornInEpoch: this.state.epoch,
      strongest: focus,
      neglected: lesson.focus,
    };
    this.state.laws.push(law);
    if (this.state.laws.length > 64) this.state.laws.splice(0, this.state.laws.length - 64);

    const sharedWord = this.createSharedWord(lesson.focus, voices);
    sharedWord.meaning = `${hook.text} It carries the visible seam of “${lesson.title}.”`;
    sharedWord.strength = 0.9;
    this.state.lexicon.push(sharedWord);

    const account = `${a.shortName} and ${b.shortName} do not repair “${lesson.title}.” They change its civic function. The scar now grants a permanent sense: ${hook.title}. Future questions will behave differently because this mistake happened.`;
    const outcome: WeaveOutcome = {
      id: `o-${this.state.cycle}-${this.rng.state.toString(16)}`,
      kind: 'reframe',
      title: hook.title,
      account,
      voices,
      focus,
      autonomous,
      probability,
      sharedWord,
      reframedLessonId: lesson.id,
    };
    this.addMemory('reframe', `${lesson.title} changed function`, hook.text);
    return outcome;
  }

  private changeQualities(
    focus: QualityKey,
    voices: [VoiceId, VoiceId],
    succeeded: boolean,
    autonomous: boolean,
    mode: ProposalMode,
  ): void {
    const a = VOICE_BY_ID[voices[0]];
    const b = VOICE_BY_ID[voices[1]];
    const attention = voices.map((id) => this.state.voices.find((voice) => voice.id === id)?.attention ?? 1);
    const underheardBonus = 1 - clamp(mean(attention) / Math.max(2, ...this.state.voices.map((voice) => voice.attention)));

    for (const quality of QUALITY_KEYS) {
      const affinity = (a.affinities[quality] + b.affinities[quality]) / 2;
      const incidental = (affinity - 0.5) * (succeeded ? 0.018 : 0.006);
      this.state.qualities[quality] = clamp(this.state.qualities[quality] + incidental, 0.06, 0.98);
    }

    if (succeeded) {
      const form = COUNCIL_FORMS[mode];
      this.state.qualities[focus] = clamp(
        this.state.qualities[focus] + (0.047 + underheardBonus * 0.012) * form.focusMultiplier,
        0.06,
        0.98,
      );
      this.state.qualities.coherence = clamp(
        this.state.qualities.coherence + (mode === 'shared-minimum' ? 0.026 : mode === 'carry-difference' ? 0.009 : 0.012),
      );
      this.state.qualities.plurality = clamp(
        this.state.qualities.plurality + underheardBonus * 0.022 + (mode === 'carry-difference' ? 0.022 : mode === 'shared-minimum' ? -0.012 : 0.006),
      );
      if (mode === 'carry-difference') this.state.qualities.reciprocity = clamp(this.state.qualities.reciprocity + 0.012);
      if (mode === 'reversible-trial') {
        this.state.qualities.agency = clamp(this.state.qualities.agency + 0.018);
        this.state.qualities.wonder = clamp(this.state.qualities.wonder + 0.015);
      }
      if (!autonomous) this.state.qualities.agency = clamp(this.state.qualities.agency + 0.011);
    } else {
      this.state.qualities[focus] = clamp(this.state.qualities[focus] - 0.021, 0.06, 0.98);
      this.state.qualities.wonder = clamp(this.state.qualities.wonder + 0.021);
      this.state.qualities.reciprocity = clamp(this.state.qualities.reciprocity + 0.006);
    }

    if (autonomous) {
      const agencyProtection = this.state.laws.filter((law) => law.neglected === 'agency').length * 0.003;
      const proposal = this.state.council?.proposals.find(
        (candidate) => candidate.id === this.state.council?.selectedProposalId,
      );
      const objections = proposal
        ? Object.values(proposal.positions).filter((position) => position === 'object').length
        : 0;
      const coercive = Boolean(proposal && objections > 0 && proposal.mode !== 'carry-difference');
      if (coercive) {
        this.state.qualities.agency = clamp(
          this.state.qualities.agency - Math.max(0.003, 0.013 - agencyProtection),
          0.06,
          0.98,
        );
      } else if (succeeded) {
        this.state.qualities.agency = clamp(this.state.qualities.agency + 0.002);
      }
    }
  }

  private createCivicWork(proposal: CivicProposal, outcome: WeaveOutcome, succeeded: boolean): CivicWork {
    const supportValues = Object.values(proposal.support);
    const averageSupport = supportValues.length > 0 ? mean(supportValues) : 0;
    const dissenters = this.state.voices
      .filter((voice) => proposal.positions[voice.id] === 'object')
      .map((voice) => voice.id);
    return {
      id: `work-${this.state.epoch}-${this.state.cycle}-${this.rng.state.toString(16)}`,
      proposalId: proposal.id,
      kind: proposal.workKind,
      mode: proposal.mode,
      title: outcome.kind === 'reframe' ? outcome.title : proposal.title,
      summary: outcome.kind === 'productive-mistake' ? `${proposal.summary} Its unresolved seam remains part of the work.` : proposal.summary,
      decision: proposal.decision,
      focus: proposal.focus,
      participants: [...proposal.authors],
      dissenters,
      bornAt: this.state.elapsed,
      bornInEpoch: this.state.epoch,
      maturity: succeeded ? 0.24 : 0.12,
      resonance: clamp(0.46 + averageSupport * 0.3 + (succeeded ? 0.1 : -0.08), 0.12, 0.92),
      echoes: 0,
      status: succeeded ? 'living' : 'contested',
      source: proposal.source,
      art: { ...proposal.art, palette: [...proposal.art.palette] },
      glyphSeed: this.rng.integer(1, 99999),
    };
  }

  private createSharedWord(focus: QualityKey, voices: [VoiceId, VoiceId]): SharedWord {
    const a = VOICE_BY_ID[voices[0]];
    const b = VOICE_BY_ID[voices[1]];
    const first = this.rng.pick(a.syllables);
    const second = this.rng.pick(b.syllables);
    let word = `${first}${second}`.replace(/(.)\1+/g, '$1');
    word = word.charAt(0).toUpperCase() + word.slice(1);
    if (this.state.lexicon.some((entry) => entry.word === word)) word = `${word}·${this.state.epoch + 1}`;
    return {
      id: `word-${this.state.cycle}-${this.rng.state.toString(16)}`,
      word,
      meaning: `${a.gift}, held answerable by ${b.gift}.`,
      participants: voices,
      quality: focus,
      bornAt: this.state.elapsed,
      strength: 0.64 + this.rng.between(-0.08, 0.12),
      glyphSeed: this.rng.integer(1, 99999),
    };
  }

  private createLesson(focus: QualityKey, voices: [VoiceId, VoiceId], attemptedLesson?: Lesson): Lesson {
    const halves = this.rng.pick(LESSON_HALVES[focus]);
    const title = `${halves[0]} ${halves[1]}`;
    const question = this.state.currentQuestion;
    return {
      id: `lesson-${this.state.cycle}-${this.rng.state.toString(16)}`,
      title,
      account: `A visible consequence of answering “${question?.title ?? 'the living question'}” before every cost could speak.`,
      focus,
      tags: [...(question?.tags ?? [focus]), ...(attemptedLesson ? attemptedLesson.tags.slice(0, 1) : [])],
      participants: voices,
      createdAt: this.state.elapsed,
      depth: attemptedLesson ? attemptedLesson.depth + 1 : 1,
      resolved: false,
      glyphSeed: this.rng.integer(1, 99999),
    };
  }

  private bestMatchingLesson(focus: QualityKey): Lesson | undefined {
    const matching = this.state.lessons.filter((lesson) => !lesson.resolved && lesson.focus === focus);
    if (matching.length > 0) return this.rng.pick(matching);
    const unresolved = this.state.lessons.filter((lesson) => !lesson.resolved);
    return unresolved.length > 0 && this.rng.next() < this.state.knobs.memoryPressure ? this.rng.pick(unresolved) : undefined;
  }

  private adaptDirectors(outcome: WeaveOutcome, authorId: DirectorId): void {
    const author = this.state.directors.find((director) => director.id === authorId);
    if (author) author.appetite = clamp(author.appetite + (outcome.kind === 'productive-mistake' ? 0.08 : -0.04), 0.12, 0.95);

    for (const director of this.state.directors) {
      if (DIRECTOR_BY_ID[director.id].quality === outcome.focus) {
        director.influence = clamp(director.influence + (outcome.kind === 'productive-mistake' ? 0.06 : -0.035), 0.1, 0.98);
      } else {
        director.appetite = clamp(director.appetite + 0.012, 0.1, 0.98);
      }
    }
  }

  private checkEpochTransition(): void {
    if (this.state.resolvedQuestions === 0 || this.state.resolvedQuestions % 9 !== 0) return;
    const values = QUALITY_KEYS.map((quality) => this.state.qualities[quality]);
    const average = mean(values);
    const minimum = Math.min(...values);
    const { strongest, weakest } = qualityExtremes(this.state.qualities);
    const compost = average < 0.31 || minimum < 0.13;
    const dawn = average >= 0.57 && minimum >= 0.38;

    this.state.epoch += 1;
    const baseName = EPOCH_NAMES[this.state.epoch % EPOCH_NAMES.length] ?? 'Living Memory';
    this.state.epochName = compost ? `Compost of ${baseName}` : dawn ? baseName : `Turning toward ${baseName}`;

    const law: EpochLaw = {
      id: `epoch-law-${this.state.epoch}-${this.rng.state.toString(16)}`,
      title: `${QUALITY_META[strongest].label} must answer to ${QUALITY_META[weakest].label}`,
      text: `The strongest civic sense may no longer grow by making ${QUALITY_META[weakest].label.toLowerCase()} carry its cost.`,
      bornInEpoch: this.state.epoch,
      strongest,
      neglected: weakest,
    };
    this.state.laws.push(law);
    if (this.state.laws.length > 64) this.state.laws.splice(0, this.state.laws.length - 64);

    if (compost) {
      for (const quality of QUALITY_KEYS) this.state.qualities[quality] = lerp(this.state.qualities[quality], 0.44, 0.65);
      for (const relationship of this.state.relationships) {
        relationship.strength = lerp(relationship.strength, 0.28, 0.5);
        relationship.tension = lerp(relationship.tension, 0.5, 0.4);
      }
      this.addMemory('compost', `Epoch ${this.state.epoch - 1} became compost`, `${law.title}. Nothing was reset; the next form inherited every scar.`);
    } else {
      for (const quality of QUALITY_KEYS) this.state.qualities[quality] = lerp(this.state.qualities[quality], 0.56, 0.16);
      this.addMemory(dawn ? 'dawn' : 'birth', dawn ? `Dawn ${this.state.epoch}: ${baseName}` : `The civilization turned`, `${law.title}. The simulation remains open.`);
    }

    const mostPresent = [...this.state.voices].sort((a, b) => b.presence - a.presence).slice(0, 2);
    for (const voice of mostPresent) voice.mutations += 1;
  }

  private addMemory(kind: MemoryEntry['kind'], title: string, detail: string): void {
    const entry: MemoryEntry = {
      id: `memory-${this.state?.cycle ?? 0}-${this.rng.state.toString(16)}-${this.state?.history.length ?? 0}`,
      cycle: this.state?.cycle ?? 0,
      epoch: this.state?.epoch ?? 0,
      kind,
      title,
      detail,
    };
    this.state.history.unshift(entry);
    if (this.state.history.length > 80) this.state.history.length = 80;
  }

  private syncRandomState(): void {
    this.state.rngState = this.rng.state;
  }

  private emit(): void {
    for (const listener of this.snapshotListeners) listener(this.state);
  }
}
