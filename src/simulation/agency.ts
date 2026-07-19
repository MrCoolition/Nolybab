import { QUALITY_META, VOICES, VOICE_BY_ID } from './content';
import { clamp, hashString, mean, SeededRandom } from './random';
import { QUALITY_KEYS } from './types';
import type {
  ActionOutcomeBand,
  Arrival,
  CivicActionAffordance,
  CivicActionInput,
  CivicActionPreview,
  CivicActionRecord,
  CivicActionResult,
  CivicDomain,
  CivicInvention,
  CivicMethod,
  CivicPressureFront,
  CivicResourceMap,
  CivicSite,
  CivicTargetKind,
  CivicTargetRef,
  CivicVerb,
  CivicWork,
  CulturalPractice,
  LivingLaw,
  PlayerAgencyState,
  PressureKind,
  ProceduralArtDirection,
  QualityKey,
  QualityMap,
  Settlement,
  SimulationState,
  SpatialPoint,
  VoiceId,
  WorldCondition,
  WorldRegion,
  WorldTerrain,
} from './types';

const RESOURCE_KEYS = ['attention', 'trust', 'vitality', 'possibility'] as const;
type ResourceKey = (typeof RESOURCE_KEYS)[number];

interface VerbDefinition {
  label: string;
  description: string;
  domains: CivicDomain[];
  targetKinds: CivicTargetKind[];
  cost: CivicResourceMap;
  quality: QualityMap;
  pressure: number;
  chance: number;
  risk: number;
}

const zeroQuality = (): QualityMap => ({
  coherence: 0,
  plurality: 0,
  reciprocity: 0,
  biosphere: 0,
  agency: 0,
  wonder: 0,
});

const resources = (attention: number, trust: number, vitality: number, possibility: number): CivicResourceMap => ({
  attention,
  trust,
  vitality,
  possibility,
});

const quality = (
  coherence: number,
  plurality: number,
  reciprocity: number,
  biosphere: number,
  agency: number,
  wonder: number,
): QualityMap => ({ coherence, plurality, reciprocity, biosphere, agency, wonder });

const ALL_DOMAINS: CivicDomain[] = ['law', 'culture', 'invention', 'habitat'];

/** Verbs are mechanics, not story templates. Domain, method, target, authors and intensity transform each one. */
export const CIVIC_VERBS: Record<CivicVerb, VerbDefinition> = {
  seed: {
    label: 'Seed',
    description: 'Begin a fragile new possibility at a chosen place.',
    domains: ALL_DOMAINS,
    targetKinds: ['pressure', 'region', 'site', 'commons'],
    cost: resources(7, 2, 7, 6),
    quality: quality(0.2, 0.35, 0.15, 0.28, 0.1, 0.58),
    pressure: -0.08,
    chance: 0.66,
    risk: 0.26,
  },
  bind: {
    label: 'Bind',
    description: 'Make two actors answerable to one another without fusing them.',
    domains: ['law', 'culture', 'habitat'],
    targetKinds: ['voice', 'relationship', 'settlement', 'region', 'commons'],
    cost: resources(8, 8, 2, 2),
    quality: quality(0.62, -0.22, 0.45, 0.08, -0.12, 0.04),
    pressure: -0.12,
    chance: 0.72,
    risk: 0.2,
  },
  shelter: {
    label: 'Shelter',
    description: 'Protect a vulnerable voice, arrival, practice, or place long enough to answer.',
    domains: ['law', 'culture', 'habitat'],
    targetKinds: ['voice', 'site', 'settlement', 'arrival', 'culture', 'pressure'],
    cost: resources(7, 5, 8, 1),
    quality: quality(-0.1, 0.34, 0.32, 0.24, 0.56, -0.08),
    pressure: -0.17,
    chance: 0.77,
    risk: 0.16,
  },
  translate: {
    label: 'Translate',
    description: 'Carry meaning across a difference while leaving its source visible.',
    domains: ['law', 'culture', 'invention'],
    targetKinds: ['pressure', 'voice', 'relationship', 'arrival', 'law', 'culture', 'invention'],
    cost: resources(10, 5, 1, 4),
    quality: quality(0.42, 0.18, 0.48, 0.05, 0.16, 0.26),
    pressure: -0.14,
    chance: 0.7,
    risk: 0.22,
  },
  reroute: {
    label: 'Reroute',
    description: 'Move a consequence through space instead of pretending it disappeared.',
    domains: ['invention', 'habitat'],
    targetKinds: ['pressure', 'arrival', 'relationship'],
    cost: resources(6, 3, 10, 5),
    quality: quality(0.12, 0.08, -0.12, 0.22, 0.42, 0.22),
    pressure: -0.05,
    chance: 0.64,
    risk: 0.34,
  },
  invite: {
    label: 'Invite',
    description: 'Give the unrequested a real route into the world.',
    domains: ALL_DOMAINS,
    targetKinds: ['region', 'settlement', 'site', 'arrival', 'commons', 'pressure'],
    cost: resources(5, 5, 4, 11),
    quality: quality(-0.18, 0.56, 0.24, 0.2, 0.18, 0.72),
    pressure: 0.03,
    chance: 0.57,
    risk: 0.42,
  },
  amend: {
    label: 'Amend',
    description: 'Change something the world already built without erasing its lineage.',
    domains: ALL_DOMAINS,
    targetKinds: ['work', 'site', 'settlement', 'invention', 'law', 'culture'],
    cost: resources(8, 9, 3, 5),
    quality: quality(0.34, 0.3, 0.42, 0.08, 0.52, 0.24),
    pressure: -0.16,
    chance: 0.76,
    risk: 0.18,
  },
  compost: {
    label: 'Compost',
    description: 'End a form, recover capacity, and let its useful matter feed another future.',
    domains: ALL_DOMAINS,
    targetKinds: ['work', 'site', 'settlement', 'invention', 'law', 'culture'],
    cost: resources(5, 6, 1, 2),
    quality: quality(-0.14, 0.22, 0.38, 0.48, 0.18, 0.32),
    pressure: -0.11,
    chance: 0.82,
    risk: 0.15,
  },
  refuse: {
    label: 'Refuse',
    description: 'Draw a consequential boundary. The no is visible and has a cost.',
    domains: ['law', 'culture', 'habitat'],
    targetKinds: ['pressure', 'arrival', 'law', 'culture', 'invention'],
    cost: resources(6, 10, 4, 1),
    quality: quality(-0.34, 0.2, -0.2, 0.18, 0.78, -0.16),
    pressure: -0.3,
    chance: 0.79,
    risk: 0.24,
  },
};

const METHOD_QUALITY: Record<CivicMethod, QualityMap> = {
  witness: quality(-0.02, 0.2, 0.28, 0.05, 0.12, 0.08),
  prototype: quality(0.12, 0.04, -0.04, 0.06, 0.2, 0.24),
  ritual: quality(0.2, 0.12, 0.22, 0.04, -0.06, 0.18),
  boundary: quality(0.18, -0.08, -0.04, 0.1, 0.32, -0.04),
  reciprocity: quality(0.04, 0.08, 0.34, 0.22, 0.08, 0.02),
  remembrance: quality(0.1, 0.12, 0.26, 0.06, 0.08, 0.18),
  play: quality(-0.08, 0.22, 0.08, 0.04, 0.12, 0.38),
};

const METHOD_COST: Record<CivicMethod, Partial<CivicResourceMap>> = {
  witness: { attention: 3, trust: -1 },
  prototype: { vitality: 3, possibility: 2 },
  ritual: { attention: 2, trust: 2 },
  boundary: { trust: 3, vitality: 1 },
  reciprocity: { trust: 2, vitality: 2 },
  remembrance: { attention: 3, possibility: -1 },
  play: { possibility: 4, attention: 1 },
};

const METHOD_FOCUS: Record<CivicMethod, QualityKey> = {
  witness: 'plurality',
  prototype: 'agency',
  ritual: 'coherence',
  boundary: 'agency',
  reciprocity: 'reciprocity',
  remembrance: 'reciprocity',
  play: 'wonder',
};

const DOMAIN_FOCUS: Record<CivicDomain, QualityKey> = {
  law: 'agency',
  culture: 'plurality',
  invention: 'wonder',
  habitat: 'biosphere',
};

const DOMAIN_COST: Record<CivicDomain, Partial<CivicResourceMap>> = {
  law: { trust: 3, attention: 1 },
  culture: { attention: 3, possibility: 1 },
  invention: { vitality: 2, possibility: 4 },
  habitat: { vitality: 5, trust: 1 },
};

const PRESSURE_DATA: Record<
  PressureKind,
  { focus: QualityKey; opposed: QualityKey; subjects: string[]; disturbances: string[]; tags: string[] }
> = {
  capture: {
    focus: 'agency',
    opposed: 'coherence',
    subjects: ['A useful protocol', 'A beloved steward', 'The common route'],
    disturbances: ['has begun choosing who may alter it', 'is closing around its original authors', 'works too well to remain optional'],
    tags: ['control', 'permission', 'infrastructure'],
  },
  silence: {
    focus: 'plurality',
    opposed: 'coherence',
    subjects: ['An absent answer', 'A quiet edge', 'The language beneath consensus'],
    disturbances: ['is becoming inaudible', 'has stopped reaching the center', 'is mistaken for agreement'],
    tags: ['voice', 'absence', 'translation'],
  },
  fracture: {
    focus: 'coherence',
    opposed: 'plurality',
    subjects: ['Two necessary promises', 'A shared crossing', 'The council rhythm'],
    disturbances: ['can no longer occupy the same ground', 'is splitting faster than it can be named', 'has developed incompatible tempos'],
    tags: ['coordination', 'difference', 'rhythm'],
  },
  overshoot: {
    focus: 'biosphere',
    opposed: 'wonder',
    subjects: ['The living margin', 'A generous harvest', 'The warm season'],
    disturbances: ['is spending tomorrow as if it were surplus', 'has outrun its returning cycles', 'is turning abundance into debt'],
    tags: ['ecology', 'future', 'limit'],
  },
  stagnation: {
    focus: 'wonder',
    opposed: 'coherence',
    subjects: ['A proven answer', 'The safest path', 'An inherited success'],
    disturbances: ['has made alternatives feel irresponsible', 'is repeating without learning', 'no longer admits surprise'],
    tags: ['habit', 'novelty', 'certainty'],
  },
  extraction: {
    focus: 'reciprocity',
    opposed: 'coherence',
    subjects: ['An invisible gift', 'A care current', 'The easy center'],
    disturbances: ['is exporting its cost to the edge', 'takes faster than it can answer', 'calls unpaid weight efficiency'],
    tags: ['care', 'burden', 'debt'],
  },
  displacement: {
    focus: 'reciprocity',
    opposed: 'agency',
    subjects: ['A moving people', 'A species route', 'The ground of belonging'],
    disturbances: ['has lost the place that knew its name', 'must cross a promise made without it', 'is arriving where every role is already assigned'],
    tags: ['arrival', 'belonging', 'movement'],
  },
  dogma: {
    focus: 'plurality',
    opposed: 'wonder',
    subjects: ['A beautiful law', 'The founding story', 'A hard-won lesson'],
    disturbances: ['has become immune to its own purpose', 'is punishing the question that once created it', 'confuses memory with obedience'],
    tags: ['law', 'memory', 'certainty'],
  },
  scarcity: {
    focus: 'reciprocity',
    opposed: 'biosphere',
    subjects: ['A shared reserve', 'The night shelter', 'A season of enough'],
    disturbances: ['cannot reach every need at once', 'has become a contest between unlike urgencies', 'is shrinking while promises expand'],
    tags: ['resource', 'care', 'limit'],
  },
};

const PRESSURE_KINDS = Object.keys(PRESSURE_DATA) as PressureKind[];
const TERRAINS: WorldTerrain[] = ['commons', 'canopy', 'wetland', 'highland', 'basin', 'delta', 'ruin'];
const REGION_STEMS = ['Unwritten', 'Mosslight', 'Manywater', 'Openhand', 'Second Dawn', 'Wildglass', 'Remembering'];
const REGION_ENDS = ['Commons', 'Canopy', 'Reach', 'Fold', 'Basin', 'Threshold', 'Terrace'];
const ARRIVAL_NAMES = ['The Lantern Kin', 'Rain That Remembers', 'The Far-Seed Caravan', 'A Choir of Pollinators', 'The Unmapped Signal', 'The Walking Archive'];
const DOMAIN_NOUNS: Record<CivicDomain, string[]> = {
  law: ['Right', 'Accord', 'Covenant', 'Permission', 'Promise', 'Charter'],
  culture: ['Ritual', 'Chorus', 'Custom', 'Feast', 'Gesture', 'Story'],
  invention: ['Instrument', 'Bridge', 'Engine', 'Lens', 'Vessel', 'Signal'],
  habitat: ['Hearth', 'Canopy', 'Commons', 'Sanctuary', 'Village', 'Garden'],
};
const VERB_NAMES: Record<CivicVerb, string[]> = {
  seed: ['First', 'Germinating', 'Unfinished'],
  bind: ['Braided', 'Answerable', 'Two-Shore'],
  shelter: ['Porous', 'Held', 'Night'],
  translate: ['Many-Tongued', 'Crossing', 'Counterspoken'],
  reroute: ['Turning', 'Sideways', 'Riverwise'],
  invite: ['Open-Door', 'Unrequested', 'Guest'],
  amend: ['Second', 'Rewritten', 'Living'],
  compost: ['After', 'Composted', 'Returning'],
  refuse: ['Uncaptured', 'Boundary', 'Right-of-No'],
};

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function point(value: SpatialPoint | undefined, fallback: SpatialPoint = { x: 0.5, y: 0.5 }): SpatialPoint {
  return {
    x: clamp(finite(value?.x, fallback.x), 0.04, 0.96),
    y: clamp(finite(value?.y, fallback.y), 0.08, 0.92),
  };
}

function distance(a: SpatialPoint, b: SpatialPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function resourceCopy(value: CivicResourceMap): CivicResourceMap {
  return resources(value.attention, value.trust, value.vitality, value.possibility);
}

function emptyCost(): CivicResourceMap {
  return resources(0, 0, 0, 0);
}

function voicePosition(id: VoiceId): SpatialPoint {
  const definition = VOICE_BY_ID[id];
  return {
    x: clamp(0.5 + Math.cos(definition.angle) * 0.34, 0.08, 0.92),
    y: clamp(0.5 + Math.sin(definition.angle) * 0.34, 0.1, 0.9),
  };
}

function createArt(
  domain: CivicDomain,
  verb: CivicVerb,
  lead: VoiceId,
  ally: VoiceId | undefined,
  seed: number,
): ProceduralArtDirection {
  const motifs: Record<CivicDomain, ProceduralArtDirection['motif']> = {
    law: 'threshold',
    culture: 'braid',
    invention: 'constellation',
    habitat: 'mycelium',
  };
  const geometries: Record<CivicVerb, ProceduralArtDirection['geometry']> = {
    seed: 'branching', bind: 'braided', shelter: 'layered', translate: 'braided', reroute: 'orbital',
    invite: 'radial', amend: 'layered', compost: 'branching', refuse: 'radial',
  };
  const motions: Record<CivicVerb, ProceduralArtDirection['motion']> = {
    seed: 'breathe', bind: 'pulse', shelter: 'still', translate: 'ripple', reroute: 'drift',
    invite: 'ripple', amend: 'breathe', compost: 'drift', refuse: 'pulse',
  };
  const palette = [VOICE_BY_ID[lead].cssColor, ally ? VOICE_BY_ID[ally].cssColor : QUALITY_META[DOMAIN_FOCUS[domain]].color, QUALITY_META[DOMAIN_FOCUS[domain]].color];
  return {
    motif: motifs[domain],
    geometry: geometries[verb],
    motion: motions[verb],
    palette: [...new Set(palette)].slice(0, 5),
    density: clamp(0.36 + ((seed >>> 5) % 31) / 100),
    symmetry: verb === 'bind' ? 0.68 : verb === 'invite' ? 0.18 : 0.42,
    texture: `${verb} marks with ${domain} grain and visible provenance`,
    caption: `${CIVIC_VERBS[verb].label} / ${domain}`,
  };
}

function createRegion(index: number, rng: SeededRandom): WorldRegion {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 7 + rng.between(-0.08, 0.08);
  const ring = index === 0 ? 0.12 : 0.31 + rng.between(-0.025, 0.025);
  return {
    id: `region-${index}-${rng.state.toString(16)}`,
    name: `${REGION_STEMS[index] ?? rng.pick(REGION_STEMS)} ${REGION_ENDS[(index * 3 + rng.integer(0, 2)) % REGION_ENDS.length]}`,
    terrain: TERRAINS[index % TERRAINS.length] ?? 'commons',
    position: point({ x: 0.5 + Math.cos(angle) * ring, y: 0.5 + Math.sin(angle) * ring }),
    radius: index === 0 ? 0.2 : rng.between(0.105, 0.16),
    vitality: rng.between(0.44, 0.78),
    openness: rng.between(0.4, 0.82),
    pressure: rng.between(0.08, 0.24),
    neighbours: [],
    traits: [rng.pick(['porous', 'wind-shaped', 'remembering', 'seasonal', 'many-voiced', 'unfinished'])],
    glyphSeed: rng.integer(1, 999_999),
  };
}

function connectRegions(regions: WorldRegion[]): void {
  for (const region of regions) {
    region.neighbours = regions
      .filter((candidate) => candidate.id !== region.id)
      .sort((a, b) => distance(region.position, a.position) - distance(region.position, b.position))
      .slice(0, region.terrain === 'commons' ? 4 : 2)
      .map((candidate) => candidate.id);
  }
}

function createPressure(regions: WorldRegion[], rng: SeededRandom, generation = 0, parent?: CivicPressureFront): CivicPressureFront {
  const kind = parent && rng.next() < 0.5 ? parent.kind : rng.pick(PRESSURE_KINDS);
  const data = PRESSURE_DATA[kind];
  const region = parent
    ? regions.find((candidate) => candidate.id === parent.affectedIds[0]) ?? rng.pick(regions)
    : rng.weighted(regions, (candidate) => 0.2 + candidate.pressure);
  const position = parent
    ? point({ x: parent.position.x + rng.between(-0.1, 0.1), y: parent.position.y + rng.between(-0.1, 0.1) })
    : point({ x: region.position.x + rng.between(-region.radius * 0.7, region.radius * 0.7), y: region.position.y + rng.between(-region.radius * 0.7, region.radius * 0.7) });
  const subject = rng.pick(data.subjects);
  const disturbance = rng.pick(data.disturbances);
  const id = `pressure-${rng.state.toString(16)}-${rng.integer(100, 999)}`;
  return {
    id,
    kind,
    title: `${subject} ${disturbance}`,
    detail: `${region.name} cannot remain unchanged. This pressure moves, splits, and remembers where it was redirected.`,
    focus: data.focus,
    opposedQuality: data.opposed,
    position,
    velocity: { x: rng.between(-0.0024, 0.0024), y: rng.between(-0.0019, 0.0019) },
    radius: rng.between(0.075, 0.14),
    severity: parent ? clamp(parent.severity * 0.58, 0.22, 0.7) : rng.between(0.28, 0.58),
    momentum: rng.between(0.25, 0.74),
    timeToBreach: rng.between(62, 118) / (1 + generation * 0.12),
    generation,
    lineage: parent ? [...parent.lineage, parent.id].slice(-8) : [],
    affectedIds: [region.id],
    tags: [kind, ...data.tags],
    state: 'active',
    glyphSeed: rng.integer(1, 999_999),
  };
}

function createArrival(regions: WorldRegion[], rng: SeededRandom, actionId?: string, destination?: SpatialPoint): Arrival {
  const region = destination
    ? [...regions].sort((a, b) => distance(a.position, destination) - distance(b.position, destination))[0] ?? regions[0]!
    : rng.pick(regions);
  const focus = rng.pick(QUALITY_KEYS);
  const need = rng.pick(QUALITY_KEYS.filter((candidate) => candidate !== focus));
  const glyphSeed = rng.integer(1, 999_999);
  const kind = rng.pick(['people', 'species', 'idea', 'weather', 'signal'] as const);
  return {
    id: `arrival-${rng.state.toString(16)}-${rng.integer(10, 99)}`,
    name: rng.pick(ARRIVAL_NAMES),
    kind,
    origin: point({ x: rng.next() < 0.5 ? 0.03 : 0.97, y: rng.between(0.12, 0.88) }),
    destination: point(destination, region.position),
    regionId: region.id,
    timeToArrival: rng.between(42, 98),
    urgency: rng.between(0.3, 0.8),
    status: 'approaching',
    partySize: kind === 'people' ? rng.integer(14, 46) : 0,
    gifts: [focus],
    needs: [need],
    description: `${region.name} has time to answer this arrival, but no option is costless.`,
    traits: [rng.pick(['untranslated', 'weary', 'curious', 'seasonal', 'mutualist', 'uninvited'])],
    visualDirection: createArt('culture', 'invite', rng.pick(VOICES).id, undefined, glyphSeed),
    source: actionId ? 'player' : 'world',
    originActionId: actionId,
    revision: 0,
    glyphSeed,
  };
}

export function createInitialAgency(state: Pick<SimulationState, 'elapsed' | 'seedPhrase'>, rng: SeededRandom): PlayerAgencyState {
  const regions = Array.from({ length: 7 }, (_, index) => createRegion(index, rng));
  connectRegions(regions);
  const commons = regions.find((region) => region.terrain === 'commons') ?? regions[0]!;
  const seedArt = createArt('habitat', 'seed', 'cultivators', 'ecostewards', rng.state);
  const settlement: Settlement = {
    id: `settlement-seed-${rng.state.toString(16)}`,
    name: 'The Three Keepers Camp',
    form: 'hearth',
    regionId: commons.id,
    position: point(commons.position),
    inhabitants: 3,
    maturity: 0.09,
    resilience: 0.38,
    openness: 0.91,
    foundedBy: ['cultivators', 'ecostewards'],
    bornAt: state.elapsed,
    description: `Three keepers tend an almost-empty commons around "${state.seedPhrase}" while watching for the first people to arrive.`,
    traits: ['keeper-camp', 'almost-empty', 'seed-born'],
    visualDirection: seedArt,
    source: 'world',
    originActionId: 'world-seed',
    revision: 0,
    glyphSeed: rng.integer(1, 999_999),
  };
  const site: CivicSite = {
    id: `site-seed-${rng.state.toString(16)}`,
    title: 'The Empty Center',
    kind: 'assembly',
    regionId: commons.id,
    position: point({ x: commons.position.x + 0.035, y: commons.position.y - 0.02 }),
    intensity: 0.46,
    permeability: 0.9,
    participants: ['cultivators', 'ecostewards'],
    linkedWorkIds: [],
    status: 'living',
    bornAt: state.elapsed,
    description: 'A council ground deliberately built around what nobody owns.',
    visualDirection: createArt('culture', 'invite', 'cultivators', 'ecostewards', rng.state),
    source: 'world',
    originActionId: 'world-seed',
    revision: 0,
    glyphSeed: rng.integer(1, 999_999),
  };
  const firstArrival = createArrival(regions, rng, undefined, commons.position);
  firstArrival.name = 'The Far-Seed Families';
  firstArrival.kind = 'people';
  firstArrival.partySize = rng.integer(24, 42);
  firstArrival.timeToArrival = rng.between(38, 62);
  firstArrival.urgency = rng.between(0.52, 0.78);
  firstArrival.description = `${firstArrival.partySize} people are visibly walking toward ${commons.name}, carrying skills, needs, disagreements, children, and names the gamemasters have not yet learned.`;
  firstArrival.traits = ['human', 'families', 'far-seed', 'unsettled'];
  return {
    resources: resources(72, 62, 74, 66),
    pressures: [createPressure(regions, rng), createPressure(regions, rng), createPressure(regions, rng)],
    regions,
    settlements: [settlement],
    inventions: [],
    charterLaws: [],
    cultures: [],
    arrivals: [firstArrival],
    sites: [site],
    pendingAction: null,
    lastAction: null,
    actionHistory: [],
    authoredActions: 0,
    ignoredPressures: 0,
    variety: 1,
    recentlyUsedVerbs: [],
    worldCondition: 'regenerating',
    nanoWorldLines: {},
  };
}

/** Hydrates pre-agency v1 saves and tolerates partial snapshots from an interrupted write. */
export function normalizeAgencyState(state: SimulationState, rng: SeededRandom): void {
  const previous = (state as Partial<SimulationState>).agency as Partial<PlayerAgencyState> | undefined;
  const fallback = createInitialAgency(state, new SeededRandom(hashString(`${state.seedPhrase}::player-agency`)));
  if (!previous || typeof previous !== 'object') {
    state.agency = fallback;
    return;
  }
  const sourceResources = previous.resources as Partial<CivicResourceMap> | undefined;
  const normalizedResources = resourceCopy(fallback.resources);
  for (const key of RESOURCE_KEYS) normalizedResources[key] = clamp(finite(sourceResources?.[key], fallback.resources[key]), 0, 100);
  state.agency = {
    resources: normalizedResources,
    pressures: Array.isArray(previous.pressures) ? previous.pressures : fallback.pressures,
    regions: Array.isArray(previous.regions) && previous.regions.length > 0 ? previous.regions : fallback.regions,
    settlements: Array.isArray(previous.settlements) ? previous.settlements : fallback.settlements,
    inventions: Array.isArray(previous.inventions) ? previous.inventions : [],
    charterLaws: Array.isArray(previous.charterLaws) ? previous.charterLaws : [],
    cultures: Array.isArray(previous.cultures) ? previous.cultures : [],
    arrivals: (Array.isArray(previous.arrivals) ? previous.arrivals : fallback.arrivals).map((arrival) => ({
      ...arrival,
      partySize: Math.max(0, Math.floor(finite(arrival.partySize, arrival.kind === 'people' ? 24 : 0))),
      revision: Math.max(0, Math.floor(finite(arrival.revision, 0))),
    })),
    sites: Array.isArray(previous.sites) ? previous.sites : fallback.sites,
    pendingAction: previous.pendingAction ?? null,
    lastAction: previous.lastAction ?? null,
    actionHistory: Array.isArray(previous.actionHistory) ? previous.actionHistory.slice(-160) : [],
    authoredActions: Math.max(0, Math.floor(finite(previous.authoredActions, 0))),
    ignoredPressures: Math.max(0, Math.floor(finite(previous.ignoredPressures, 0))),
    variety: clamp(finite(previous.variety, 1), 0, 1),
    recentlyUsedVerbs: Array.isArray(previous.recentlyUsedVerbs) ? previous.recentlyUsedVerbs.slice(-12) : [],
    worldCondition: previous.worldCondition ?? 'regenerating',
    nanoWorldLines: previous.nanoWorldLines && typeof previous.nanoWorldLines === 'object' ? previous.nanoWorldLines : {},
  };
  connectRegions(state.agency.regions);
  void rng;
}

function artifactPosition(state: SimulationState, target: CivicTargetRef): SpatialPoint | null {
  if (target.position) return point(target.position);
  if (target.kind === 'commons') return { x: 0.5, y: 0.5 };
  if (target.kind === 'voice' && VOICE_BY_ID[target.id as VoiceId]) return voicePosition(target.id as VoiceId);
  if (target.kind === 'pressure') return state.agency.pressures.find((item) => item.id === target.id)?.position ?? null;
  if (target.kind === 'region') return state.agency.regions.find((item) => item.id === target.id)?.position ?? null;
  if (target.kind === 'settlement') return state.agency.settlements.find((item) => item.id === target.id)?.position ?? null;
  if (target.kind === 'invention') return state.agency.inventions.find((item) => item.id === target.id)?.position ?? null;
  if (target.kind === 'law') return state.agency.charterLaws.find((item) => item.id === target.id)?.position ?? null;
  if (target.kind === 'culture') return state.agency.cultures.find((item) => item.id === target.id)?.position ?? null;
  if (target.kind === 'arrival') return state.agency.arrivals.find((item) => item.id === target.id)?.destination ?? null;
  if (target.kind === 'site') return state.agency.sites.find((item) => item.id === target.id)?.position ?? null;
  if (target.kind === 'work') {
    const site = state.agency.sites.find((item) => item.linkedWorkIds.includes(target.id));
    if (site) return site.position;
    const work = state.works.find((item) => item.id === target.id);
    if (work) return point({ x: 0.5 + Math.sin(work.glyphSeed) * 0.22, y: 0.5 + Math.cos(work.glyphSeed) * 0.22 });
    return null;
  }
  if (target.kind === 'relationship') {
    const ids = [target.id, target.secondaryId].filter(Boolean) as VoiceId[];
    const parsed = ids.length >= 2 ? ids : target.id.split(':').filter((id) => VOICE_BY_ID[id as VoiceId]) as VoiceId[];
    if (parsed.length < 2) return null;
    const a = voicePosition(parsed[0]!);
    const b = voicePosition(parsed[1]!);
    return point({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  return null;
}

function targetLabel(state: SimulationState, target: CivicTargetRef): string {
  if (target.kind === 'commons') return 'the open commons';
  if (target.kind === 'voice') return VOICE_BY_ID[target.id as VoiceId]?.shortName ?? target.id;
  const collections: Array<Array<{ id: string; name?: string; title?: string }>> = [
    state.agency.pressures,
    state.agency.regions,
    state.agency.settlements,
    state.agency.inventions,
    state.agency.charterLaws,
    state.agency.cultures,
    state.agency.arrivals,
    state.agency.sites,
    state.works,
  ];
  for (const collection of collections) {
    const found = collection.find((item) => item.id === target.id);
    if (found) return found.name ?? found.title ?? target.id;
  }
  return target.id;
}

function pressureForTarget(state: SimulationState, target: CivicTargetRef): CivicPressureFront | undefined {
  if (target.kind === 'pressure') return state.agency.pressures.find((pressure) => pressure.id === target.id);
  const position = artifactPosition(state, target);
  if (!position) return undefined;
  return [...state.agency.pressures]
    .filter((pressure) => pressure.state === 'active')
    .sort((a, b) => distance(a.position, position) - distance(b.position, position))[0];
}

function relationshipStrength(state: SimulationState, lead: VoiceId, ally: VoiceId | undefined): number {
  if (!ally) return 0.22;
  return state.relationships.find(
    (relationship) => (relationship.a === lead && relationship.b === ally) || (relationship.a === ally && relationship.b === lead),
  )?.strength ?? 0.12;
}

function computeCost(input: CivicActionInput): CivicResourceMap {
  const definition = CIVIC_VERBS[input.verb];
  const multiplier = input.intensity === 1 ? 0.72 : input.intensity === 2 ? 1.1 : 1.62;
  const result = emptyCost();
  for (const key of RESOURCE_KEYS) {
    const shift = (METHOD_COST[input.method][key] ?? 0) + (DOMAIN_COST[input.domain][key] ?? 0);
    result[key] = Math.max(0, Math.round((definition.cost[key] + shift) * multiplier));
  }
  return result;
}

function computeQualityDelta(input: CivicActionInput, pressure: CivicPressureFront | undefined): QualityMap {
  const definition = CIVIC_VERBS[input.verb];
  const result = zeroQuality();
  const intensity = 0.018 + input.intensity * 0.013;
  for (const key of QUALITY_KEYS) result[key] = (definition.quality[key] + METHOD_QUALITY[input.method][key]) * intensity;
  result[DOMAIN_FOCUS[input.domain]] += 0.012 * input.intensity;
  if (pressure) {
    result[pressure.focus] += 0.008 * input.intensity;
    result[pressure.opposedQuality] -= 0.004 * input.intensity;
  }
  return result;
}

function inputErrors(state: SimulationState, input: CivicActionInput): string[] {
  const errors: string[] = [];
  const definition = CIVIC_VERBS[input.verb];
  if (!definition) return ['Unknown civic verb.'];
  if (!definition.domains.includes(input.domain)) errors.push(`${definition.label} cannot currently author ${input.domain}.`);
  if (!definition.targetKinds.includes(input.target.kind)) errors.push(`${definition.label} cannot act on ${input.target.kind}.`);
  if (!VOICE_BY_ID[input.lead]) errors.push('Choose a living voice to lead.');
  if (input.ally && (!VOICE_BY_ID[input.ally] || input.ally === input.lead)) errors.push('The ally must be another living voice.');
  if (![1, 2, 3].includes(input.intensity)) errors.push('Intensity must be one, two, or three.');
  if (!artifactPosition(state, input.target)) errors.push('That spatial target is no longer present.');
  if (input.verb === 'bind' && !input.ally && input.target.kind !== 'relationship') errors.push('Binding requires a second voice.');
  if (input.verb === 'reroute' && !input.destination) errors.push('Rerouting requires a destination in the world.');
  if (input.lessonId && !state.lessons.some((lesson) => lesson.id === input.lessonId && !lesson.resolved)) errors.push('That memory is no longer unresolved.');
  if (input.authoredName && input.authoredName.trim().length > 72) errors.push('Authored names must be 72 characters or fewer.');
  return errors;
}

export function getActionAffordances(state: SimulationState, target?: CivicTargetRef): CivicActionAffordance[] {
  return (Object.keys(CIVIC_VERBS) as CivicVerb[]).map((verb) => {
    const definition = CIVIC_VERBS[verb];
    let reason: string | undefined;
    if (target && !definition.targetKinds.includes(target.kind)) reason = `${definition.label} does not act on ${target.kind}.`;
    else if (target && !artifactPosition(state, target)) reason = 'That target is no longer present.';
    else {
      const affordable = RESOURCE_KEYS.every((key) => state.agency.resources[key] >= definition.cost[key] * 0.72);
      if (!affordable) reason = 'The commons needs time to recover capacity.';
    }
    return {
      verb,
      label: definition.label,
      description: definition.description,
      domains: [...definition.domains],
      targetKinds: [...definition.targetKinds],
      available: !reason,
      reason,
      baseCost: resourceCopy(definition.cost),
    };
  });
}

export function previewCivicAction(state: SimulationState, input: CivicActionInput): CivicActionPreview {
  const errors = inputErrors(state, input);
  const cost = CIVIC_VERBS[input.verb] ? computeCost(input) : emptyCost();
  const resourcesAfter = resourceCopy(state.agency.resources);
  for (const key of RESOURCE_KEYS) {
    resourcesAfter[key] = Math.max(0, resourcesAfter[key] - cost[key]);
    if (state.agency.resources[key] < cost[key]) errors.push(`Not enough ${key}: ${cost[key]} needed.`);
  }
  const pressure = pressureForTarget(state, input.target);
  const definition = CIVIC_VERBS[input.verb] ?? CIVIC_VERBS.seed;
  const lead = VOICE_BY_ID[input.lead];
  const focus = pressure?.focus ?? DOMAIN_FOCUS[input.domain];
  const link = relationshipStrength(state, input.lead, input.ally);
  const recentUses = state.agency.recentlyUsedVerbs.filter((verb) => verb === input.verb).length;
  const averageReserve = mean(RESOURCE_KEYS.map((key) => state.agency.resources[key] / 100));
  const methodFit = METHOD_FOCUS[input.method] === focus ? 0.08 : 0;
  const domainFit = DOMAIN_FOCUS[input.domain] === focus ? 0.06 : 0;
  const voiceFit = lead ? lead.affinities[focus] * 0.16 : 0;
  const allyFit = input.ally ? Math.abs((lead?.affinities[focus] ?? 0) - VOICE_BY_ID[input.ally].affinities[focus]) * 0.1 : 0;
  const memoryFit = input.lessonId ? 0.08 : 0;
  const chance = clamp(
    definition.chance + methodFit + domainFit + voiceFit + allyFit + link * 0.11 + memoryFit + (averageReserve - 0.5) * 0.12 -
      (pressure?.severity ?? 0.2) * 0.17 - (input.intensity - 1) * 0.055 - recentUses * 0.07,
    0.16,
    0.94,
  );
  const risk = clamp(definition.risk + (input.intensity - 1) * 0.1 + recentUses * 0.08 + (pressure?.momentum ?? 0) * 0.08 - link * 0.08);
  const predicted: ActionOutcomeBand = chance >= 0.68 ? 'rooted' : chance >= 0.4 ? 'contested' : 'ruptured';
  const pressureDelta = definition.pressure * (0.7 + input.intensity * 0.35);
  const qualityDelta = computeQualityDelta(input, pressure);
  const warnings: string[] = [];
  const negativeQualities = QUALITY_KEYS.filter((key) => qualityDelta[key] < -0.005);
  if (negativeQualities.length > 0) warnings.push(`${negativeQualities.map((key) => QUALITY_META[key].label).join(' and ')} will carry part of the cost.`);
  if (recentUses > 0) warnings.push('The Countermirror recognizes this habit; repetition has made the move less potent.');
  if (input.verb === 'reroute') warnings.push('The pressure moves. It is not erased, and its next region will remember the transfer.');
  if (input.verb === 'invite') warnings.push('An invitation creates agency the council does not control.');
  if (input.intensity === 3) warnings.push('This commitment can change the world quickly, including in ways nobody authored.');
  const creates: CivicActionPreview['creates'] = input.verb === 'amend' || input.verb === 'compost' || input.verb === 'reroute'
    ? null
    : input.verb === 'refuse' ? 'site' : input.domain;
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings,
    targetLabel: targetLabel(state, input.target),
    summary: `${VOICE_BY_ID[input.lead]?.shortName ?? 'A voice'} will ${input.verb} ${targetLabel(state, input.target)} through ${input.method}, committing ${input.intensity === 1 ? 'a gesture' : input.intensity === 2 ? 'a practice' : 'an institution'}.`,
    cost,
    resourcesAfter,
    qualityDelta,
    pressureDelta,
    chance,
    risk,
    novelty: clamp(0.34 + state.knobs.novelty * 0.38 + (recentUses === 0 ? 0.18 : -recentUses * 0.08) + (input.method === 'play' ? 0.12 : 0)),
    predicted,
    creates,
    consequences: [
      pressureDelta < 0 ? `${Math.round(Math.abs(pressureDelta) * 100)} pressure may be transformed here.` : 'The act deliberately permits new pressure.',
      `${QUALITY_META[focus].label} becomes the action's test, not a decorative score.`,
      input.ally ? `${VOICE_BY_ID[input.ally].shortName} can alter the result through its relationship with ${VOICE_BY_ID[input.lead]?.shortName}.` : 'A lone lead acts faster but carries less relational memory.',
    ],
  };
}

function nearestRegion(state: SimulationState, position: SpatialPoint): WorldRegion {
  return [...state.agency.regions].sort((a, b) => distance(a.position, position) - distance(b.position, position))[0] ?? state.agency.regions[0]!;
}

function uniqueArtifactName(state: SimulationState, input: CivicActionInput, rng: SeededRandom): string {
  const clean = input.authoredName?.replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 72);
  const base = clean || `${rng.pick(VERB_NAMES[input.verb])} ${rng.pick(DOMAIN_NOUNS[input.domain])}`;
  const used = new Set([
    ...state.agency.settlements.map((item) => item.name),
    ...state.agency.inventions.map((item) => item.name),
    ...state.agency.charterLaws.map((item) => item.name),
    ...state.agency.cultures.map((item) => item.name),
  ]);
  return used.has(base) ? `${base} ${state.agency.authoredActions + 1}` : base;
}

function artifactDescription(input: CivicActionInput, target: string, outcome: ActionOutcomeBand): string {
  const relation = input.ally ? `${VOICE_BY_ID[input.lead].shortName} and ${VOICE_BY_ID[input.ally].shortName}` : VOICE_BY_ID[input.lead].shortName;
  const ending = outcome === 'rooted' ? 'It took root.' : outcome === 'contested' ? 'Its seams remain active and revisable.' : 'It broke open, leaving a usable scar.';
  return `${relation} chose to ${input.verb} ${target} through ${input.method}. ${ending}`;
}

function siteKind(domain: CivicDomain, verb: CivicVerb): CivicSite['kind'] {
  if (verb === 'refuse') return 'threshold';
  if (domain === 'invention') return 'workshop';
  if (domain === 'culture') return 'assembly';
  if (domain === 'law') return 'threshold';
  return verb === 'shelter' ? 'sanctuary' : 'garden';
}

function workKind(domain: CivicDomain): CivicWork['kind'] {
  if (domain === 'law') return 'consent-protocol';
  if (domain === 'culture') return 'listening-ritual';
  if (domain === 'invention') return 'open-question';
  return 'ecological-covenant';
}

function workMode(verb: CivicVerb): CivicWork['mode'] {
  if (verb === 'bind' || verb === 'shelter' || verb === 'refuse') return 'shared-minimum';
  if (verb === 'translate' || verb === 'invite') return 'carry-difference';
  return 'reversible-trial';
}

function createArtifact(
  state: SimulationState,
  input: CivicActionInput,
  actionId: string,
  outcome: ActionOutcomeBand,
  preview: CivicActionPreview,
  rng: SeededRandom,
): { ids: string[]; site?: CivicSite } {
  const targetPosition = artifactPosition(state, input.target) ?? { x: 0.5, y: 0.5 };
  const destination = point(input.destination, {
    x: targetPosition.x + rng.between(-0.055, 0.055),
    y: targetPosition.y + rng.between(-0.045, 0.045),
  });
  const region = nearestRegion(state, destination);
  const name = uniqueArtifactName(state, input, rng);
  const authors = [input.lead, input.ally].filter(Boolean) as VoiceId[];
  const glyphSeed = rng.integer(1, 999_999);
  const visualDirection = createArt(input.domain, input.verb, input.lead, input.ally, glyphSeed);
  const description = artifactDescription(input, preview.targetLabel, outcome);
  const maturity = outcome === 'rooted' ? 0.3 + input.intensity * 0.07 : outcome === 'contested' ? 0.17 : 0.08;
  const ids: string[] = [];
  let artifactId = '';

  if (input.domain === 'habitat') {
    const settlement: Settlement = {
      id: `settlement-${actionId}`,
      name,
      form: rng.pick(['hearth', 'canopy-commons', 'river-fold', 'walking-village', 'threshold-house'] as const),
      regionId: region.id,
      position: destination,
      inhabitants: 8 + input.intensity * rng.integer(7, 18),
      maturity,
      resilience: clamp(0.32 + state.agency.resources.vitality / 220 + (outcome === 'rooted' ? 0.12 : -0.04)),
      openness: clamp(0.46 + state.qualities.plurality * 0.35 + (input.verb === 'invite' ? 0.16 : 0)),
      foundedBy: authors,
      bornAt: state.elapsed,
      description,
      traits: [input.verb, input.method, outcome],
      visualDirection,
      source: 'player',
      originActionId: actionId,
      revision: 0,
      glyphSeed,
    };
    state.agency.settlements.push(settlement);
    artifactId = settlement.id;
  } else if (input.domain === 'invention') {
    const invention: CivicInvention = {
      id: `invention-${actionId}`,
      name,
      principle: `${CIVIC_VERBS[input.verb].label} through ${input.method}; remain answerable to ${QUALITY_META[DOMAIN_FOCUS[input.domain]].label}.`,
      regionId: region.id,
      position: destination,
      maturity,
      reliability: clamp(preview.chance * (outcome === 'rooted' ? 0.9 : 0.58)),
      risk: clamp(preview.risk + (outcome === 'ruptured' ? 0.25 : 0)),
      createdBy: authors,
      bornAt: state.elapsed,
      description,
      traits: [input.verb, input.method, outcome],
      visualDirection,
      source: 'player',
      originActionId: actionId,
      revision: 0,
      glyphSeed,
    };
    state.agency.inventions.push(invention);
    artifactId = invention.id;
  } else if (input.domain === 'law') {
    const law: LivingLaw = {
      id: `law-${actionId}`,
      name,
      text: `${VOICE_BY_ID[input.lead].shortName} may ${input.verb}; everyone affected keeps the right to amend the result.`,
      regionId: region.id,
      position: destination,
      strength: clamp(maturity + 0.18),
      contestability: clamp(0.88 - input.intensity * 0.12 + (input.method === 'witness' ? 0.12 : 0)),
      scopeIds: [input.target.id],
      authoredBy: authors,
      bornAt: state.elapsed,
      amendments: 0,
      description,
      traits: [input.verb, input.method, outcome],
      visualDirection,
      source: 'player',
      originActionId: actionId,
      revision: 0,
      glyphSeed,
    };
    state.agency.charterLaws.push(law);
    artifactId = law.id;
  } else {
    const culture: CulturalPractice = {
      id: `culture-${actionId}`,
      name,
      practice: `${CIVIC_VERBS[input.verb].label} ${preview.targetLabel} through a repeatable ${input.method}.`,
      regionId: region.id,
      position: destination,
      adoption: clamp(maturity + state.agency.resources.trust / 300),
      diversity: clamp(0.42 + state.qualities.plurality * 0.42 - input.intensity * 0.04),
      carriers: authors,
      bornAt: state.elapsed,
      mutations: 0,
      description,
      traits: [input.verb, input.method, outcome],
      visualDirection,
      source: 'player',
      originActionId: actionId,
      revision: 0,
      glyphSeed,
    };
    state.agency.cultures.push(culture);
    artifactId = culture.id;
  }
  ids.push(artifactId);

  const site: CivicSite = {
    id: `site-${actionId}`,
    title: `${name} / ${CIVIC_VERBS[input.verb].label} site`,
    kind: siteKind(input.domain, input.verb),
    regionId: region.id,
    position: destination,
    intensity: maturity,
    permeability: clamp(0.78 - input.intensity * 0.09 + (input.method === 'witness' ? 0.12 : 0)),
    participants: authors,
    linkedWorkIds: [],
    status: outcome === 'rooted' ? 'growing' : 'contested',
    bornAt: state.elapsed,
    description,
    visualDirection,
    source: 'player',
    originActionId: actionId,
    revision: 0,
    glyphSeed: rng.integer(1, 999_999),
  };
  state.agency.sites.push(site);
  ids.push(site.id);
  return { ids, site };
}

function amendOrCompostTarget(state: SimulationState, input: CivicActionInput, outcome: ActionOutcomeBand): string[] {
  const ids: string[] = [];
  const amount = outcome === 'rooted' ? 0.18 : outcome === 'contested' ? 0.08 : -0.06;
  const settlement = state.agency.settlements.find((item) => item.id === input.target.id);
  if (settlement) {
    settlement.maturity = clamp(settlement.maturity + amount);
    settlement.resilience = clamp(settlement.resilience + (input.verb === 'compost' ? -0.2 : amount * 0.6));
    settlement.traits.push(input.verb === 'compost' ? 'returning' : 'amended');
    settlement.revision += 1;
    ids.push(settlement.id);
  }
  const invention = state.agency.inventions.find((item) => item.id === input.target.id);
  if (invention) {
    invention.maturity = clamp(invention.maturity + amount);
    invention.risk = clamp(invention.risk + (input.verb === 'compost' ? -0.18 : -amount * 0.4));
    invention.traits.push(input.verb === 'compost' ? 'returned-to-parts' : 'amended');
    invention.revision += 1;
    ids.push(invention.id);
  }
  const law = state.agency.charterLaws.find((item) => item.id === input.target.id);
  if (law) {
    law.strength = clamp(law.strength + (input.verb === 'compost' ? -0.28 : amount));
    law.contestability = clamp(law.contestability + (input.verb === 'amend' ? 0.12 : 0.04));
    law.amendments += 1;
    law.traits.push(input.verb === 'compost' ? 'sunset' : 'amended');
    law.revision += 1;
    ids.push(law.id);
  }
  const culture = state.agency.cultures.find((item) => item.id === input.target.id);
  if (culture) {
    culture.adoption = clamp(culture.adoption + (input.verb === 'compost' ? -0.25 : amount));
    culture.diversity = clamp(culture.diversity + (input.verb === 'amend' ? 0.14 : 0.06));
    culture.mutations += 1;
    culture.traits.push(input.verb === 'compost' ? 'composted' : 'mutated');
    culture.revision += 1;
    ids.push(culture.id);
  }
  const site = state.agency.sites.find((item) => item.id === input.target.id);
  if (site) {
    site.intensity = clamp(site.intensity + (input.verb === 'compost' ? -0.26 : amount));
    site.status = input.verb === 'compost' ? 'dormant' : outcome === 'rooted' ? 'living' : 'contested';
    site.revision += 1;
    ids.push(site.id);
  }
  const work = state.works.find((item) => item.id === input.target.id);
  if (work) {
    work.maturity = clamp(work.maturity + (input.verb === 'compost' ? -0.24 : amount));
    work.status = input.verb === 'compost' ? 'composted' : outcome === 'rooted' ? 'living' : 'contested';
    ids.push(work.id);
  }
  return ids;
}

function updateRelationship(state: SimulationState, input: CivicActionInput, outcome: ActionOutcomeBand): void {
  if (!input.ally) return;
  const relationship = state.relationships.find(
    (item) => (item.a === input.lead && item.b === input.ally) || (item.a === input.ally && item.b === input.lead),
  );
  if (!relationship) return;
  const factor = outcome === 'rooted' ? 1 : outcome === 'contested' ? 0.45 : -0.45;
  const strength = input.verb === 'bind' ? 0.12 : input.verb === 'translate' ? 0.08 : 0.045;
  relationship.strength = clamp(relationship.strength + strength * input.intensity * factor);
  relationship.tension = clamp(relationship.tension + (input.verb === 'refuse' ? 0.08 : -0.025) * factor);
  relationship.exchanges += 1;
}

function settleHumanArrival(
  state: SimulationState,
  arrival: Arrival,
  actionId: string,
  rng: SeededRandom,
  welcomed: boolean,
): Settlement | null {
  if (arrival.kind !== 'people' || arrival.partySize <= 0) return null;
  const existing = state.agency.settlements.find(
    (settlement) => settlement.originActionId === actionId || settlement.traits.includes(`arrival:${arrival.id}`),
  );
  if (existing) {
    if (!existing.traits.includes(`arrival:${arrival.id}`)) {
      existing.inhabitants += arrival.partySize;
      existing.traits.push(`arrival:${arrival.id}`);
    }
    existing.maturity = clamp(existing.maturity + (welcomed ? 0.12 : 0.045));
    existing.openness = clamp(existing.openness + (welcomed ? 0.08 : -0.025));
    return existing;
  }
  const region = state.agency.regions.find((candidate) => candidate.id === arrival.regionId) ?? nearestRegion(state, arrival.destination);
  const settlement: Settlement = {
    id: `settlement-${arrival.id}`,
    name: `${arrival.name} Landing`,
    form: rng.pick(['hearth', 'canopy-commons', 'river-fold', 'walking-village', 'threshold-house'] as const),
    regionId: region.id,
    position: point(arrival.destination),
    inhabitants: arrival.partySize,
    maturity: welcomed ? 0.24 : 0.12,
    resilience: clamp(region.vitality * 0.62 + (welcomed ? 0.16 : 0.02)),
    openness: clamp(region.openness * 0.72 + (welcomed ? 0.18 : -0.04)),
    foundedBy: welcomed ? ['cultivators', 'mountaineers'] : ['mountaineers'],
    bornAt: state.elapsed,
    description: welcomed
      ? `${arrival.partySize} people were received as authors of ${region.name}, not inventory. Their settlement will change as their relationships do.`
      : `${arrival.partySize} people improvised a foothold after no council answered their arrival. The unmet welcome remains visible.`,
    traits: ['arrival-settlement', `arrival:${arrival.id}`, welcomed ? 'welcomed' : 'self-settled'],
    visualDirection: arrival.visualDirection,
    source: welcomed ? 'player' : 'world',
    originActionId: actionId,
    revision: 0,
    glyphSeed: rng.integer(1, 999_999),
  };
  state.agency.settlements.push(settlement);
  return settlement;
}

function applyPressureAction(
  state: SimulationState,
  input: CivicActionInput,
  outcome: ActionOutcomeBand,
  preview: CivicActionPreview,
  sideEffects: string[],
): void {
  const pressure = pressureForTarget(state, input.target);
  if (!pressure) return;
  const factor = outcome === 'rooted' ? 1 : outcome === 'contested' ? 0.5 : -0.38;
  pressure.severity = clamp(pressure.severity + preview.pressureDelta * factor, 0, 1);
  pressure.momentum = clamp(pressure.momentum + preview.pressureDelta * factor * 0.45, 0.03, 1);
  pressure.timeToBreach += outcome === 'rooted' ? 16 * input.intensity : outcome === 'contested' ? 5 : -8;
  if (input.verb === 'reroute' && input.destination) {
    const previousRegion = nearestRegion(state, pressure.position);
    pressure.position = point(input.destination);
    pressure.affectedIds = [nearestRegion(state, pressure.position).id];
    pressure.lineage.push(`rerouted-from:${previousRegion.id}`);
    sideEffects.push(`${previousRegion.name} is relieved, but ${nearestRegion(state, pressure.position).name} inherits the moving consequence.`);
  }
  if (pressure.severity <= 0.08) {
    pressure.state = 'transformed';
    state.agency.resources.trust = clamp(state.agency.resources.trust + 4, 0, 100);
    state.agency.resources.possibility = clamp(state.agency.resources.possibility + 5, 0, 100);
    sideEffects.push(`${pressure.title} changed function instead of vanishing.`);
  }
}

function materializeWork(
  state: SimulationState,
  input: CivicActionInput,
  actionId: string,
  outcome: ActionOutcomeBand,
  preview: CivicActionPreview,
  createdIds: string[],
  site: CivicSite | undefined,
  rng: SeededRandom,
): CivicWork {
  const title = uniqueArtifactName(state, input, rng);
  const work: CivicWork = {
    id: `work-${actionId}`,
    proposalId: actionId,
    kind: workKind(input.domain),
    mode: workMode(input.verb),
    title,
    summary: artifactDescription(input, preview.targetLabel, outcome),
    decision: preview.summary,
    focus: DOMAIN_FOCUS[input.domain],
    participants: [input.lead, input.ally].filter(Boolean) as VoiceId[],
    dissenters: [],
    bornAt: state.elapsed,
    bornInEpoch: state.epoch,
    maturity: outcome === 'rooted' ? 0.28 : 0.12,
    resonance: clamp(preview.chance * (outcome === 'rooted' ? 0.88 : 0.5)),
    echoes: 0,
    status: outcome === 'rooted' ? 'living' : 'contested',
    source: 'deterministic',
    art: createArt(input.domain, input.verb, input.lead, input.ally, rng.state),
    glyphSeed: rng.integer(1, 999_999),
  };
  state.works.push(work);
  if (state.works.length > 96) {
    const count = state.works.length - 96;
    state.works.splice(0, count);
    state.archivedWorkCount += count;
  }
  createdIds.push(work.id);
  if (site) site.linkedWorkIds.push(work.id);
  return work;
}

export function performCivicAction(state: SimulationState, input: CivicActionInput, rng: SeededRandom): CivicActionResult | null {
  const preview = previewCivicAction(state, input);
  if (!preview.valid) return null;
  for (const key of RESOURCE_KEYS) state.agency.resources[key] = clamp(state.agency.resources[key] - preview.cost[key], 0, 100);
  const roll = rng.next();
  const outcome: ActionOutcomeBand = roll <= preview.chance
    ? 'rooted'
    : roll <= preview.chance + (1 - preview.chance) * 0.64
      ? 'contested'
      : 'ruptured';
  const actionId = `action-${state.epoch}-${state.cycle + 1}-${rng.state.toString(16)}`;
  const targetPosition = artifactPosition(state, input.target) ?? { x: 0.5, y: 0.5 };
  const qualityFactor = outcome === 'rooted' ? 1 : outcome === 'contested' ? 0.48 : -0.4;
  for (const key of QUALITY_KEYS) state.qualities[key] = clamp(state.qualities[key] + preview.qualityDelta[key] * qualityFactor, 0.05, 0.98);
  const sideEffects = [...preview.warnings];
  applyPressureAction(state, input, outcome, preview, sideEffects);
  updateRelationship(state, input, outcome);
  let createdIds: string[] = [];
  let site: CivicSite | undefined;

  if (input.verb === 'amend' || input.verb === 'compost') {
    createdIds = amendOrCompostTarget(state, input, outcome);
    if (input.verb === 'compost') {
      state.agency.resources.vitality = clamp(state.agency.resources.vitality + 5 + input.intensity * 2, 0, 100);
      state.agency.resources.possibility = clamp(state.agency.resources.possibility + 3 + input.intensity, 0, 100);
      sideEffects.push('Material capacity returned, but the ended form remains in memory.');
    }
  } else if (input.verb === 'reroute') {
    createdIds = [input.target.id];
  } else {
    const created = createArtifact(state, input, actionId, outcome, preview, rng);
    createdIds = created.ids;
    site = created.site;
  }

  if (input.verb === 'invite' && input.target.kind !== 'arrival') {
    const arrival = createArrival(state.agency.regions, rng, actionId, input.destination ?? targetPosition);
    arrival.timeToArrival = Math.max(16, arrival.timeToArrival - input.intensity * 8);
    state.agency.arrivals.push(arrival);
    createdIds.push(arrival.id);
    sideEffects.push(`${arrival.name} now has a route into ${nearestRegion(state, arrival.destination).name}.`);
  }
  const arrival = input.target.kind === 'arrival' ? state.agency.arrivals.find((item) => item.id === input.target.id) : undefined;
  if (arrival) {
    if (input.verb === 'shelter' || input.verb === 'invite') {
      arrival.status = outcome === 'ruptured' ? 'diverted' : 'settled';
      if (outcome !== 'ruptured') {
        const settlement = settleHumanArrival(state, arrival, actionId, rng, true);
        if (settlement && !createdIds.includes(settlement.id)) createdIds.push(settlement.id);
        sideEffects.push(`${arrival.name} became visible inhabitants of ${settlement?.name ?? nearestRegion(state, arrival.destination).name}.`);
      }
    }
    if (input.verb === 'refuse') arrival.status = 'refused';
    if (input.verb === 'reroute' && input.destination) {
      arrival.destination = point(input.destination);
      arrival.regionId = nearestRegion(state, arrival.destination).id;
      arrival.status = 'diverted';
    }
    arrival.revision += 1;
  }

  const work = materializeWork(state, input, actionId, outcome, preview, createdIds, site, rng);
  const summary = outcome === 'rooted'
    ? `${CIVIC_VERBS[input.verb].label} took root: ${work.title}.`
    : outcome === 'contested'
      ? `${work.title} exists, but its disagreement remains alive.`
      : `${CIVIC_VERBS[input.verb].label} ruptured. The failed form became civic terrain instead of disappearing.`;
  const record: CivicActionRecord = {
    id: actionId,
    cycle: state.cycle + 1,
    bornAt: state.elapsed,
    input: { ...input, target: { ...input.target }, destination: input.destination ? { ...input.destination } : undefined },
    outcome,
    summary,
    cost: preview.cost,
    qualityDelta: Object.fromEntries(QUALITY_KEYS.map((key) => [key, preview.qualityDelta[key] * qualityFactor])) as QualityMap,
    pressureDelta: preview.pressureDelta * (outcome === 'rooted' ? 1 : outcome === 'contested' ? 0.5 : -0.38),
    createdIds,
    sideEffects,
  };
  const result: CivicActionResult = {
    ...record,
    pulse: {
      verb: input.verb,
      origin: voicePosition(input.lead),
      destination: point(input.destination, targetPosition),
      color: VOICE_BY_ID[input.lead].cssColor,
      magnitude: input.intensity * (outcome === 'rooted' ? 1 : outcome === 'contested' ? 0.72 : 0.5),
      seed: rng.integer(1, 999_999),
    },
    resourcesAfter: resourceCopy(state.agency.resources),
  };
  state.agency.lastAction = result;
  state.agency.actionHistory.push(record);
  if (state.agency.actionHistory.length > 160) state.agency.actionHistory.splice(0, state.agency.actionHistory.length - 160);
  state.agency.authoredActions += 1;
  state.agency.pendingAction = null;
  state.agency.recentlyUsedVerbs.push(input.verb);
  if (state.agency.recentlyUsedVerbs.length > 12) state.agency.recentlyUsedVerbs.splice(0, state.agency.recentlyUsedVerbs.length - 12);
  state.agency.variety = clamp(new Set(state.agency.recentlyUsedVerbs).size / 7 + Math.min(0.2, state.agency.actionHistory.length / 100));
  return result;
}

export interface AgencyWorldEvent {
  kind: 'pressure-born' | 'pressure-split' | 'breach' | 'arrival' | 'settlement' | 'mutation';
  id: string;
  title: string;
  detail: string;
}

function updateWorldCondition(state: SimulationState): void {
  const active = state.agency.pressures.filter((pressure) => pressure.state === 'active' || pressure.state === 'breached');
  const pressure = active.length > 0 ? mean(active.map((item) => item.severity)) : 0;
  const reserve = mean(RESOURCE_KEYS.map((key) => state.agency.resources[key] / 100));
  let condition: WorldCondition;
  if (pressure > 0.72 || reserve < 0.2) condition = 'fracturing';
  else if (pressure > 0.5 || reserve < 0.38) condition = 'strained';
  else if (state.agency.authoredActions > 4 && pressure < 0.3 && reserve > 0.55) condition = 'flourishing';
  else condition = 'regenerating';
  state.agency.worldCondition = condition;
}

/** Advances pressures, arrivals, regions and player capacity. Returns only meaningful world changes. */
export function stepAgencyWorld(state: SimulationState, rng: SeededRandom, seconds: number): AgencyWorldEvent[] {
  const events: AgencyWorldEvent[] = [];
  const recovery: CivicResourceMap = {
    attention: 0.085 * (state.paused ? 0 : 1),
    trust: 0.035 * mean(state.relationships.map((item) => item.strength + 0.2)),
    vitality: 0.045 * state.qualities.biosphere,
    possibility: 0.04 * state.qualities.wonder * (0.6 + state.agency.variety * 0.4),
  };
  for (const key of RESOURCE_KEYS) state.agency.resources[key] = clamp(state.agency.resources[key] + recovery[key] * seconds, 0, 100);

  for (const pressure of state.agency.pressures) {
    if (pressure.state === 'transformed') continue;
    pressure.position = point({ x: pressure.position.x + pressure.velocity.x * seconds, y: pressure.position.y + pressure.velocity.y * seconds });
    if (pressure.position.x <= 0.05 || pressure.position.x >= 0.95) pressure.velocity.x *= -1;
    if (pressure.position.y <= 0.09 || pressure.position.y >= 0.91) pressure.velocity.y *= -1;
    pressure.timeToBreach -= seconds * (0.72 + pressure.momentum * 0.58);
    pressure.severity = clamp(pressure.severity + pressure.momentum * 0.00075 * seconds, 0, 1);
    const region = nearestRegion(state, pressure.position);
    pressure.affectedIds = [region.id];
    region.pressure = clamp(region.pressure + pressure.severity * 0.0007 * seconds);
    if (pressure.timeToBreach <= 0) {
      pressure.state = 'breached';
      pressure.timeToBreach = 48 + rng.between(0, 34);
      pressure.momentum = clamp(pressure.momentum + 0.08);
      state.agency.ignoredPressures += 1;
      state.qualities[pressure.focus] = clamp(state.qualities[pressure.focus] - (0.018 + pressure.severity * 0.025), 0.05, 0.98);
      state.agency.resources.trust = clamp(state.agency.resources.trust - 4 - pressure.severity * 3, 0, 100);
      region.vitality = clamp(region.vitality - pressure.severity * 0.045);
      events.push({
        kind: 'breach',
        id: pressure.id,
        title: `${pressure.title} crossed a threshold`,
        detail: `${region.name} changed because the pressure was not answered in time. The consequence remains playable.`,
      });
      if (pressure.generation < 3 && pressure.severity > 0.66 && state.agency.pressures.length < 7) {
        const child = createPressure(state.agency.regions, rng, pressure.generation + 1, pressure);
        pressure.severity *= 0.68;
        state.agency.pressures.push(child);
        events.push({ kind: 'pressure-split', id: child.id, title: child.title, detail: `A branch of ${pressure.id} now moves on its own.` });
      }
    } else if (pressure.state === 'breached' && pressure.timeToBreach > 28) {
      pressure.state = 'active';
    }
  }

  for (const arrival of state.agency.arrivals) {
    if (arrival.status !== 'approaching') continue;
    arrival.timeToArrival -= seconds;
    const progress = clamp(1 - arrival.timeToArrival / 100);
    arrival.origin = point({
      x: arrival.origin.x + (arrival.destination.x - arrival.origin.x) * 0.003 * seconds * (0.5 + progress),
      y: arrival.origin.y + (arrival.destination.y - arrival.origin.y) * 0.003 * seconds * (0.5 + progress),
    });
    if (arrival.timeToArrival <= 0) {
      arrival.status = 'settled';
      arrival.revision += 1;
      const region = state.agency.regions.find((item) => item.id === arrival.regionId) ?? nearestRegion(state, arrival.destination);
      region.openness = clamp(region.openness + 0.04 - arrival.urgency * 0.03);
      for (const gift of arrival.gifts) state.qualities[gift] = clamp(state.qualities[gift] + 0.012);
      for (const need of arrival.needs) state.qualities[need] = clamp(state.qualities[need] - 0.009);
      const settlement = settleHumanArrival(state, arrival, `arrival:${arrival.id}`, rng, false);
      events.push({ kind: 'arrival', id: arrival.id, title: `${arrival.name} arrived without a council answer`, detail: `${region.name} improvised a welcome. Its gifts and unmet needs both entered the world.` });
      if (settlement) {
        events.push({
          kind: 'settlement',
          id: settlement.id,
          title: `${settlement.name} took physical form`,
          detail: `${settlement.inhabitants} people are now visible inhabitants of ${region.name}; their settlement will mature, strain, and change.`,
        });
      }
    }
  }

  for (const settlement of state.agency.settlements) {
    const region = state.agency.regions.find((item) => item.id === settlement.regionId);
    if (!region) continue;
    settlement.maturity = clamp(settlement.maturity + 0.00012 * seconds * settlement.resilience);
    settlement.resilience = clamp(settlement.resilience + (region.vitality - region.pressure - 0.25) * 0.00008 * seconds);
    const growth = settlement.resilience > 0.52 && region.pressure < 0.55 ? seconds * settlement.openness * 0.002 : -seconds * region.pressure * 0.001;
    settlement.inhabitants = Math.max(1, Math.round(settlement.inhabitants + growth));
    const site = state.agency.sites.find((item) => item.originActionId === settlement.originActionId);
    if (site && site.status === 'growing' && settlement.maturity > 0.48) site.status = 'living';
  }
  for (const invention of state.agency.inventions) {
    invention.maturity = clamp(invention.maturity + 0.0001 * seconds * invention.reliability);
    invention.risk = clamp(invention.risk + (invention.reliability < 0.35 ? 0.00008 : -0.00003) * seconds);
  }
  for (const culture of state.agency.cultures) {
    culture.adoption = clamp(culture.adoption + (culture.diversity - 0.45) * 0.0001 * seconds);
  }
  for (const law of state.agency.charterLaws) {
    law.strength = clamp(law.strength + (law.contestability - 0.5) * 0.00004 * seconds);
  }

  state.agency.pressures = state.agency.pressures.filter((pressure) => pressure.state !== 'transformed' || rng.next() > 0.018 * seconds);
  if (state.agency.pressures.length < 3 || (state.agency.pressures.length < 6 && rng.next() < 0.014 * seconds)) {
    const pressure = createPressure(state.agency.regions, rng);
    state.agency.pressures.push(pressure);
    events.push({ kind: 'pressure-born', id: pressure.id, title: pressure.title, detail: pressure.detail });
  }
  if (state.agency.arrivals.filter((arrival) => arrival.status === 'approaching').length < 2 && rng.next() < 0.008 * seconds) {
    const arrival = createArrival(state.agency.regions, rng);
    state.agency.arrivals.push(arrival);
    events.push({ kind: 'arrival', id: arrival.id, title: `${arrival.name} appeared at the edge`, detail: arrival.description });
  }
  if (state.agency.arrivals.length > 32) state.agency.arrivals.splice(0, state.agency.arrivals.length - 32);
  if (state.agency.sites.length > 128) state.agency.sites.splice(0, state.agency.sites.length - 128);
  updateWorldCondition(state);
  return events;
}

export function spatialTargetPosition(state: SimulationState, target: CivicTargetRef): SpatialPoint | null {
  return artifactPosition(state, target);
}
