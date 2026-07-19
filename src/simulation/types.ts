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
export type CivicDomain = 'law' | 'culture' | 'invention' | 'habitat';
export type CivicVerb =
  | 'seed'
  | 'bind'
  | 'shelter'
  | 'translate'
  | 'reroute'
  | 'invite'
  | 'amend'
  | 'compost'
  | 'refuse';
export type CivicMethod =
  | 'witness'
  | 'prototype'
  | 'ritual'
  | 'boundary'
  | 'reciprocity'
  | 'remembrance'
  | 'play';
export type CivicTargetKind =
  | 'pressure'
  | 'voice'
  | 'relationship'
  | 'work'
  | 'site'
  | 'region'
  | 'settlement'
  | 'invention'
  | 'law'
  | 'culture'
  | 'arrival'
  | 'commons';
export type PressureKind =
  | 'capture'
  | 'silence'
  | 'fracture'
  | 'overshoot'
  | 'stagnation'
  | 'extraction'
  | 'displacement'
  | 'dogma'
  | 'scarcity';
export type WorldTerrain = 'canopy' | 'wetland' | 'highland' | 'basin' | 'delta' | 'ruin' | 'commons';
export type WorldCondition = 'flourishing' | 'strained' | 'fracturing' | 'regenerating';
export type ArrivalKind = 'people' | 'species' | 'idea' | 'weather' | 'signal';
export type ArrivalStatus = 'approaching' | 'welcomed' | 'diverted' | 'settled' | 'refused';
export type ActionOutcomeBand = 'rooted' | 'contested' | 'ruptured';
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

export interface SpatialPoint {
  /** Normalized world-space coordinate. */
  x: number;
  /** Normalized world-space coordinate. */
  y: number;
}

export interface CivicResourceMap {
  /** Finite player focus. Recovers fastest when the world is allowed to breathe. */
  attention: number;
  /** Relational permission to attempt consequential acts. */
  trust: number;
  /** Ecological and material capacity. */
  vitality: number;
  /** Room for risk, mutation, and the not-yet-legible. */
  possibility: number;
}

export interface CivicTargetRef {
  kind: CivicTargetKind;
  id: string;
  secondaryId?: string;
  position?: SpatialPoint;
}

export interface CivicPressureFront {
  id: string;
  kind: PressureKind;
  title: string;
  detail: string;
  focus: QualityKey;
  opposedQuality: QualityKey;
  position: SpatialPoint;
  velocity: SpatialPoint;
  radius: number;
  severity: number;
  momentum: number;
  timeToBreach: number;
  generation: number;
  lineage: string[];
  affectedIds: string[];
  tags: string[];
  state: 'emerging' | 'active' | 'transformed' | 'breached';
  glyphSeed: number;
}

export interface WorldRegion {
  id: string;
  name: string;
  terrain: WorldTerrain;
  position: SpatialPoint;
  radius: number;
  vitality: number;
  openness: number;
  pressure: number;
  neighbours: string[];
  traits: string[];
  glyphSeed: number;
}

export interface Settlement {
  id: string;
  name: string;
  form: 'hearth' | 'canopy-commons' | 'river-fold' | 'walking-village' | 'threshold-house';
  regionId: string;
  position: SpatialPoint;
  inhabitants: number;
  maturity: number;
  resilience: number;
  openness: number;
  foundedBy: VoiceId[];
  bornAt: number;
  description: string;
  traits: string[];
  visualDirection: ProceduralArtDirection;
  source: 'world' | 'player' | 'nano-enriched';
  originActionId: string;
  revision: number;
  glyphSeed: number;
}

export interface CivicInvention {
  id: string;
  name: string;
  principle: string;
  regionId: string;
  position: SpatialPoint;
  maturity: number;
  reliability: number;
  risk: number;
  createdBy: VoiceId[];
  bornAt: number;
  description: string;
  traits: string[];
  visualDirection: ProceduralArtDirection;
  source: 'world' | 'player' | 'nano-enriched';
  originActionId: string;
  revision: number;
  glyphSeed: number;
}

export interface LivingLaw {
  id: string;
  name: string;
  text: string;
  regionId: string;
  position: SpatialPoint;
  strength: number;
  contestability: number;
  scopeIds: string[];
  authoredBy: VoiceId[];
  bornAt: number;
  amendments: number;
  description: string;
  traits: string[];
  visualDirection: ProceduralArtDirection;
  source: 'world' | 'player' | 'nano-enriched';
  originActionId: string;
  revision: number;
  glyphSeed: number;
}

export interface CulturalPractice {
  id: string;
  name: string;
  practice: string;
  regionId: string;
  position: SpatialPoint;
  adoption: number;
  diversity: number;
  carriers: VoiceId[];
  bornAt: number;
  mutations: number;
  description: string;
  traits: string[];
  visualDirection: ProceduralArtDirection;
  source: 'world' | 'player' | 'nano-enriched';
  originActionId: string;
  revision: number;
  glyphSeed: number;
}

export interface CivicSite {
  id: string;
  title: string;
  kind: 'assembly' | 'garden' | 'archive' | 'threshold' | 'workshop' | 'sanctuary' | 'crossing';
  regionId: string;
  position: SpatialPoint;
  intensity: number;
  permeability: number;
  participants: VoiceId[];
  linkedWorkIds: string[];
  status: 'growing' | 'living' | 'contested' | 'dormant';
  bornAt: number;
  description: string;
  visualDirection: ProceduralArtDirection;
  source: 'world' | 'player' | 'nano-enriched';
  originActionId: string;
  revision: number;
  glyphSeed: number;
}

export interface Arrival {
  id: string;
  name: string;
  kind: ArrivalKind;
  origin: SpatialPoint;
  destination: SpatialPoint;
  regionId: string;
  timeToArrival: number;
  urgency: number;
  status: ArrivalStatus;
  /** Human headcount; zero for non-human arrivals. */
  partySize: number;
  gifts: QualityKey[];
  needs: QualityKey[];
  description: string;
  traits: string[];
  visualDirection: ProceduralArtDirection;
  source: 'world' | 'player' | 'nano-enriched';
  originActionId?: string;
  revision: number;
  glyphSeed: number;
}

export interface CivicActionInput {
  domain: CivicDomain;
  verb: CivicVerb;
  method: CivicMethod;
  target: CivicTargetRef;
  lead: VoiceId;
  ally?: VoiceId;
  intensity: 1 | 2 | 3;
  lessonId?: string;
  authoredName?: string;
  destination?: SpatialPoint;
}

export interface CivicActionAffordance {
  verb: CivicVerb;
  label: string;
  description: string;
  domains: CivicDomain[];
  targetKinds: CivicTargetKind[];
  available: boolean;
  reason?: string;
  baseCost: CivicResourceMap;
}

export interface CivicActionPreview {
  valid: boolean;
  errors: string[];
  warnings: string[];
  targetLabel: string;
  summary: string;
  cost: CivicResourceMap;
  resourcesAfter: CivicResourceMap;
  qualityDelta: QualityMap;
  pressureDelta: number;
  chance: number;
  risk: number;
  novelty: number;
  predicted: ActionOutcomeBand;
  creates: CivicDomain | 'site' | null;
  consequences: string[];
}

export interface CivicActionPulse {
  verb: CivicVerb;
  origin: SpatialPoint;
  destination: SpatialPoint;
  color: string;
  magnitude: number;
  seed: number;
}

export interface CivicActionRecord {
  id: string;
  cycle: number;
  bornAt: number;
  input: CivicActionInput;
  outcome: ActionOutcomeBand;
  summary: string;
  cost: CivicResourceMap;
  qualityDelta: QualityMap;
  pressureDelta: number;
  createdIds: string[];
  sideEffects: string[];
}

export interface CivicActionResult extends CivicActionRecord {
  pulse: CivicActionPulse;
  resourcesAfter: CivicResourceMap;
}

/**
 * Untrusted expressive enrichment for an artifact made by a deterministic
 * civic action. IDs and baseRevision form an optimistic concurrency guard.
 */
export interface NanoCivicDirection {
  model?: typeof NANO_MODEL_ID;
  actionId: string;
  artifactId: string;
  baseRevision: number;
  name?: string;
  description?: string;
  worldLine?: string;
  visualDirection?: string | Partial<ProceduralArtDirection>;
}

export interface NanoArrivalDirection {
  model?: typeof NANO_MODEL_ID;
  name?: string;
  description?: string;
  traits?: string[];
  visualDirection?: string | Partial<ProceduralArtDirection>;
}

export interface PlayerAgencyState {
  resources: CivicResourceMap;
  pressures: CivicPressureFront[];
  regions: WorldRegion[];
  settlements: Settlement[];
  inventions: CivicInvention[];
  charterLaws: LivingLaw[];
  cultures: CulturalPractice[];
  arrivals: Arrival[];
  sites: CivicSite[];
  pendingAction: CivicActionInput | null;
  lastAction: CivicActionResult | null;
  actionHistory: CivicActionRecord[];
  authoredActions: number;
  ignoredPressures: number;
  variety: number;
  recentlyUsedVerbs: CivicVerb[];
  worldCondition: WorldCondition;
  nanoWorldLines: Record<string, string>;
}

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
  /** Player-authored world layer. Added without changing v1 persistence. */
  agency: PlayerAgencyState;
}

export interface SimulationSnapshot extends Readonly<SimulationState> {}

export interface PersistedSimulation {
  state: SimulationState;
  savedAt: number;
}
