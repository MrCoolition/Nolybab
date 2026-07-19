export const QUALITY_KEYS = [
  'coherence',
  'plurality',
  'reciprocity',
  'biosphere',
  'agency',
  'wonder',
] as const;

export type QualityKey = (typeof QUALITY_KEYS)[number];
export type DirectorId = 'chorus' | 'ecology' | 'mirror' | 'archivist' | 'wild';
export type VoiceId =
  | 'pioneers'
  | 'innovators'
  | 'cultivators'
  | 'harbingers'
  | 'guardians'
  | 'ecostewards'
  | 'mountaineers';

export type QualityMap = Record<QualityKey, number>;

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

export interface WeaveOutcome {
  id: string;
  kind: 'synthesis' | 'productive-mistake' | 'reframe';
  title: string;
  account: string;
  voices: [VoiceId, VoiceId];
  focus: QualityKey;
  autonomous: boolean;
  probability: number;
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
  currentQuestion: CivicQuestion | null;
  interludeSeconds: number;
  lessons: Lesson[];
  lexicon: SharedWord[];
  laws: EpochLaw[];
  history: MemoryEntry[];
  resolvedQuestions: number;
  autonomousResponses: number;
  lastPair: [VoiceId, VoiceId] | null;
}

export interface SimulationSnapshot extends Readonly<SimulationState> {}

export interface PersistedSimulation {
  state: SimulationState;
  savedAt: number;
}
