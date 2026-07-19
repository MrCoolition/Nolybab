export const QUALITY_KEYS = [
  'coherence',
  'plurality',
  'reciprocity',
  'biosphere',
  'agency',
  'wonder',
] as const;

export const NANO_MODEL_ID = 'gpt-5.4-nano' as const;

export type QualityKey = (typeof QUALITY_KEYS)[number];
export type DirectorId =
  | 'chorus'
  | 'ecology'
  | 'mirror'
  | 'archivist'
  | 'wild'
  | 'illustrator'
  | 'architect'
  | 'storyweaver';
export type VoiceId =
  | 'pioneers'
  | 'innovators'
  | 'cultivators'
  | 'harbingers'
  | 'guardians'
  | 'ecostewards'
  | 'mountaineers';

export type QualityMap = Record<QualityKey, number>;
export type CivicPhase = 'pressure' | 'council' | 'decision' | 'action' | 'growth';
export type ProposalMode = 'shared-minimum' | 'carry-difference' | 'reversible-trial';
export type ProposalSource = 'deterministic' | 'nano';
export type CouncilPosition = 'consent' | 'stand-aside' | 'object';
export type CivicWorkKind =
  | 'shared-word'
  | 'listening-ritual'
  | 'consent-protocol'
  | 'memory-practice'
  | 'ecological-covenant'
  | 'open-question'
  | 'witness-circle'
  | 'translation-braid';

export type ArtMotif = 'braid' | 'ring' | 'scar' | 'current' | 'constellation' | 'threshold' | 'mycelium';
export type ArtGeometry = 'radial' | 'braided' | 'branching' | 'orbital' | 'layered';
export type ArtMotion = 'breathe' | 'drift' | 'pulse' | 'ripple' | 'still';

export interface VoiceDefinition {
  id: VoiceId;
  name: string;
  shortName: string;
  domain: string;
  color: number;
  cssColor: string;
  angle: number;
  affinities: QualityMap;
  verb: string;
  gift: string;
  shadow: string;
  lens: string;
  syllables: readonly string[];
  glyphSeed: number;
}

export interface VoiceState {
  id: VoiceId;
  attention: number;
  presence: number;
  cadence: number;
  lastHeard: number;
  mutations: number;
}

export interface RelationshipState {
  a: VoiceId;
  b: VoiceId;
  strength: number;
  tension: number;
  exchanges: number;
}

export interface DirectorDefinition {
  id: DirectorId;
  name: string;
  epithet: string;
  color: string;
  quality: QualityKey;
  mandate: string;
  specialist: 'system' | 'council' | 'narrative' | 'illustration';
}

export interface DirectorState {
  id: DirectorId;
  influence: number;
  appetite: number;
  lastAuthored: number;
  thought: string;
  knob: string;
}

export interface GamemasterKnobs {
  dissonance: number;
  ecologicalPressure: number;
  memoryPressure: number;
  novelty: number;
  convergence: number;
}

export interface CivicQuestion {
  id: string;
  title: string;
  situation: string;
  prompt: string;
  director: DirectorId;
  focus: QualityKey;
  needs: QualityMap;
  tags: string[];
  pressure: number;
  secondsLeft: number;
  bornAt: number;
}

export interface Lesson {
  id: string;
  title: string;
  account: string;
  focus: QualityKey;
  tags: string[];
  participants: [VoiceId, VoiceId];
  createdAt: number;
  depth: number;
  resolved: boolean;
  resolution?: string;
  glyphSeed: number;
}

export interface SharedWord {
  id: string;
  word: string;
  meaning: string;
  participants: [VoiceId, VoiceId];
  quality: QualityKey;
  bornAt: number;
  strength: number;
  glyphSeed: number;
}

export interface EpochLaw {
  id: string;
  title: string;
  text: string;
  bornInEpoch: number;
  strongest: QualityKey;
  neglected: QualityKey;
}

export interface MemoryEntry {
  id: string;
  cycle: number;
  epoch: number;
  kind: 'birth' | 'synthesis' | 'mistake' | 'reframe' | 'autonomous' | 'dawn' | 'compost';
  title: string;
  detail: string;
}

export interface ProceduralArtDirection {
  motif: ArtMotif;
  geometry: ArtGeometry;
  motion: ArtMotion;
  palette: string[];
  density: number;
  symmetry: number;
  texture: string;
  caption: string;
}

export type CivicArtDirection = ProceduralArtDirection;

export interface CivicCost {
  quality: QualityKey;
  amount: number;
  description: string;
}

export interface CivicProposal {
  id: string;
  mode: ProposalMode;
  title: string;
  summary: string;
  decision: string;
  cost: CivicCost;
  workKind: CivicWorkKind;
  art: ProceduralArtDirection;
  source: ProposalSource;
  authors: [VoiceId, VoiceId];
  focus: QualityKey;
  support: Record<VoiceId, number>;
  positions: Record<VoiceId, CouncilPosition>;
  promise: string;
  shadow: string;
  lessonId?: string;
}

export interface CouncilSession {
  id: string;
  questionId: string;
  name: string;
  phaseSeconds: number;
  autoBeatSeconds: number;
  authors: [VoiceId, VoiceId];
  heardVoices: VoiceId[];
  proposals: CivicProposal[];
  selectedProposalId: string | null;
  lessonId?: string;
  autonomous: boolean;
  voicesLine?: string;
  voiceStatements?: Partial<Record<VoiceId, string>>;
  worldLine?: string;
  illustration?: ProceduralArtDirection;
  pendingWork?: CivicWork;
  outcome?: WeaveOutcome;
}

export interface CivicWork {
  id: string;
  proposalId: string;
  kind: CivicWorkKind;
  mode: ProposalMode;
  title: string;
  summary: string;
  decision: string;
  focus: QualityKey;
  participants: VoiceId[];
  dissenters: VoiceId[];
  bornAt: number;
  bornInEpoch: number;
  maturity: number;
  resonance: number;
  echoes: number;
  status: 'living' | 'contested' | 'composted';
  source: ProposalSource;
  art: ProceduralArtDirection;
  glyphSeed: number;
}

export interface NanoProposalDirection {
  mode: ProposalMode;
  title: string;
  summary: string;
  decision: string;
  cost: string;
  workKind: CivicWorkKind | string;
  art: string | Partial<ProceduralArtDirection>;
}

export interface NanoVoiceDirection {
  voiceId: VoiceId;
  statement: string;
}

export interface NanoSpecialistDirections {
  illustrator: string;
  architect: string;
  storyweaver: string;
}

/**
 * Untrusted display enrichment returned by the Nano client. The deterministic
 * simulation validates this shape and never accepts qualities, odds, votes,
 * timers, IDs, or direct state mutations from the model.
 */
export interface NanoCouncilDirection {
  model?: typeof NANO_MODEL_ID;
  councilName?: string;
  voices?: NanoVoiceDirection[];
  proposals: NanoProposalDirection[];
  gamemasters?: NanoSpecialistDirections;
  worldLine?: string;
  illustration?: string | Partial<ProceduralArtDirection>;
}

export interface WeaveOutcome {
  id: string;
  kind: 'synthesis' | 'productive-mistake' | 'reframe';
  title: string;
  account: string;
  voices: [VoiceId, VoiceId];
  focus: QualityKey;
  autonomous: boolean;
  probability: number;
  proposalId?: string;
  workId?: string;
  sharedWord?: SharedWord;
  lesson?: Lesson;
  reframedLessonId?: string;
}

export interface SimulationState {
  version: 1;
  seedPhrase: string;
  seed: number;
  rngState: number;
  elapsed: number;
  cycle: number;
  epoch: number;
  epochName: string;
  paused: boolean;
  speed: 1 | 2 | 4;
  qualities: QualityMap;
  voices: VoiceState[];
  relationships: RelationshipState[];
  directors: DirectorState[];
  knobs: GamemasterKnobs;
  civicPhase: CivicPhase;
  council: CouncilSession | null;
  works: CivicWork[];
  archivedWorkCount: number;
  actionSeconds: number;
  currentQuestion: CivicQuestion | null;
  interludeSeconds: number;
  lessons: Lesson[];
  lexicon: SharedWord[];
  laws: EpochLaw[];
  history: MemoryEntry[];
  resolvedQuestions: number;
  autonomousResponses: number;
  coerciveAutonomousResponses: number;
  lastPair: [VoiceId, VoiceId] | null;
}

export interface SimulationSnapshot extends Readonly<SimulationState> {}

export interface PersistedSimulation {
  state: SimulationState;
  savedAt: number;
}
