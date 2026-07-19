import { VOICE_BY_ID } from '../simulation/content';
import type {
  CivicWork,
  CivicWorkKind,
  EpochLaw,
  SharedWord,
  SimulationSnapshot,
  VoiceId,
} from '../simulation/types';

export interface WorldPoint {
  x: number;
  y: number;
}

export type BiomeKind = 'wetland' | 'canopy' | 'meadow' | 'stone' | 'cultivated' | 'scarland';

export interface TerrainPatch {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rotation: number;
  roughness: number;
  kind: BiomeKind;
  seed: number;
}

export interface SettlementSite extends WorldPoint {
  voiceId: VoiceId;
  name: string;
  population: number;
  tier: number;
  radius: number;
  culture: number;
  ecology: number;
  seed: number;
}

export interface RouteSite {
  a: VoiceId;
  b: VoiceId;
  start: WorldPoint;
  control: WorldPoint;
  end: WorldPoint;
  strength: number;
  tension: number;
  exchanges: number;
  seed: number;
}

export interface WorkSite extends WorldPoint {
  work: CivicWork;
  radius: number;
  construction: number;
  seed: number;
}

export interface LawSite extends WorldPoint {
  law: EpochLaw;
  index: number;
  radius: number;
}

export interface CultureSite extends WorldPoint {
  word: SharedWord;
  radius: number;
  settlement?: VoiceId;
}

export interface AgencyRegionSite extends WorldPoint {
  id: string;
  radius: number;
  terrain: string;
  vitality: number;
  openness: number;
  seed: number;
}

export interface PressureSite extends WorldPoint {
  id: string;
  radius: number;
  severity: number;
  momentum: number;
  kind: string;
  focus: string;
  affectedIds: string[];
  seed: number;
}

export interface ArrivalSite {
  id: string;
  origin: WorldPoint;
  destination: WorldPoint;
  progress: number;
  status: string;
  gifts: string[];
  needs: string[];
  seed: number;
}

export interface AgencyArtifactSite extends WorldPoint {
  id: string;
  domain: 'law' | 'culture' | 'invention' | 'habitat' | 'site';
  title: string;
  maturity: number;
  risk: number;
  traits: string[];
  regionId?: string;
  seed: number;
}

export interface ActionPulseSite {
  verb: string;
  origin: WorldPoint;
  destination: WorldPoint;
  color: string;
  magnitude: number;
  seed: number;
}

export interface VisualWorldLayout {
  width: number;
  height: number;
  center: WorldPoint;
  mountain: WorldPoint;
  river: WorldPoint[];
  tributaries: WorldPoint[][];
  terrain: TerrainPatch[];
  settlements: SettlementSite[];
  settlementByVoice: Map<VoiceId, SettlementSite>;
  routes: RouteSite[];
  works: WorkSite[];
  laws: LawSite[];
  culture: CultureSite[];
  regions: AgencyRegionSite[];
  pressures: PressureSite[];
  arrivals: ArrivalSite[];
  artifacts: AgencyArtifactSite[];
  lastAction: ActionPulseSite | null;
  totalPopulation: number;
  inventionCount: number;
  futureMotifs: string[];
}

interface LooseRecord {
  [key: string]: unknown;
}

interface FutureWorldHints {
  settlements: LooseRecord[];
  inventions: LooseRecord[];
  regions: LooseRecord[];
  pressures: LooseRecord[];
  arrivals: LooseRecord[];
  sites: LooseRecord[];
  laws: LooseRecord[];
  cultures: LooseRecord[];
  lastAction: LooseRecord | null;
  motifs: string[];
  population?: number;
}

const VOICE_IDS = Object.keys(VOICE_BY_ID) as VoiceId[];

export function hashUnit(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

export function hashSigned(seed: number, salt: number): number {
  return hashUnit(seed, salt) * 2 - 1;
}

export function buildVisualWorld(snapshot: SimulationSnapshot, width: number, height: number): VisualWorldLayout {
  const hints = readFutureHints(snapshot);
  const marginX = Math.min(118, Math.max(40, width * 0.075));
  const marginTop = Math.min(116, Math.max(62, height * 0.12));
  const marginBottom = Math.min(120, Math.max(58, height * 0.14));
  const usableWidth = Math.max(240, width - marginX * 2);
  const usableHeight = Math.max(220, height - marginTop - marginBottom);
  const center = {
    x: marginX + usableWidth * (0.46 + hashSigned(snapshot.seed, 701) * 0.035),
    y: marginTop + usableHeight * (0.52 + hashSigned(snapshot.seed, 702) * 0.035),
  };
  const mountain = {
    x: marginX + usableWidth * (0.16 + hashUnit(snapshot.seed, 703) * 0.15),
    y: marginTop + usableHeight * (0.16 + hashUnit(snapshot.seed, 704) * 0.22),
  };

  const settlements = buildSettlements(snapshot, hints, marginX, marginTop, usableWidth, usableHeight, center);
  const settlementByVoice = new Map(settlements.map((site) => [site.voiceId, site]));
  const routes = snapshot.relationships
    .filter((relationship) => relationship.strength > 0.045 || relationship.exchanges > 0)
    .map((relationship, index): RouteSite | null => {
      const start = settlementByVoice.get(relationship.a);
      const end = settlementByVoice.get(relationship.b);
      if (!start || !end) return null;
      const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const bend = hashSigned(snapshot.seed + relationship.exchanges * 17, 800 + index) * Math.min(70, distance * 0.2);
      const towardCommons = 0.1 + relationship.strength * 0.16;
      return {
        a: relationship.a,
        b: relationship.b,
        start,
        end,
        control: {
          x: midpoint.x + (center.x - midpoint.x) * towardCommons + (-dy / distance) * bend,
          y: midpoint.y + (center.y - midpoint.y) * towardCommons + (dx / distance) * bend,
        },
        strength: relationship.strength,
        tension: relationship.tension,
        exchanges: relationship.exchanges,
        seed: snapshot.seed + index * 97,
      };
    })
    .filter((route): route is RouteSite => route !== null);

  const works = snapshot.works.slice(-80).map((work, index) => {
    const participants = work.participants.map((id) => settlementByVoice.get(id)).filter((site): site is SettlementSite => Boolean(site));
    const anchor = participants.length > 0
      ? participants.reduce((acc, site) => ({ x: acc.x + site.x / participants.length, y: acc.y + site.y / participants.length }), { x: 0, y: 0 })
      : center;
    const lane = (index % 5) - 2;
    const orbit = 30 + (index % 9) * 13 + Math.floor(index / 9) * 8;
    const angle = hashUnit(work.glyphSeed, 920 + index) * Math.PI * 2 + snapshot.epoch * 0.03;
    const x = anchor.x * 0.62 + center.x * 0.38 + Math.cos(angle) * orbit + lane * 3;
    const y = anchor.y * 0.62 + center.y * 0.38 + Math.sin(angle) * orbit * 0.64;
    const isPending = snapshot.council?.pendingWork?.id === work.id;
    const isNewest = index === snapshot.works.slice(-80).length - 1;
    const phaseProgress = snapshot.civicPhase === 'action'
      ? 0.16 + (1 - Math.min(1, snapshot.actionSeconds / 9)) * 0.6
      : snapshot.civicPhase === 'growth' ? 0.88 : 1;
    return {
      work,
      x,
      y,
      radius: 7 + work.maturity * 9 + Math.min(5, work.echoes * 0.65),
      construction: isPending || (isNewest && (snapshot.civicPhase === 'action' || snapshot.civicPhase === 'growth')) ? phaseProgress : 1,
      seed: work.glyphSeed + index * 131,
    } satisfies WorkSite;
  });

  const laws = snapshot.laws.slice(-16).map((law, index): LawSite => {
    const ring = 35 + Math.floor(index / 6) * 23;
    const angle = hashUnit(snapshot.seed + law.bornInEpoch * 101, 1100 + index) * Math.PI * 2;
    return {
      law,
      index,
      x: center.x + Math.cos(angle) * ring,
      y: center.y + Math.sin(angle) * ring * 0.62,
      radius: 4.5 + Math.min(4, law.bornInEpoch * 0.3),
    };
  });

  const culture = snapshot.lexicon.slice(-72).map((word, index): CultureSite => {
    const participant = settlementByVoice.get(word.participants[index % 2] as VoiceId);
    const anchor = participant ?? center;
    const angle = hashUnit(word.glyphSeed, 1200 + index) * Math.PI * 2;
    const distance = 18 + (index % 7) * 7;
    return {
      word,
      x: anchor.x + Math.cos(angle) * distance,
      y: anchor.y + Math.sin(angle) * distance * 0.65,
      radius: 1.8 + word.strength * 2.5,
      settlement: participant?.voiceId,
    };
  });

  const river = buildRiver(snapshot.seed, width, height, center, snapshot.epoch);
  const tributaries = settlements
    .filter((site) => site.ecology > 0.45 || site.voiceId === 'ecostewards' || site.voiceId === 'cultivators')
    .slice(0, 4)
    .map((site, index) => buildTributary(snapshot.seed + index * 83, site, nearestPoint(river, site)));
  const terrain = buildTerrain(snapshot, width, height, center, mountain);
  const regions = hints.regions.map((region, index) => ({
    id: readString(region.id) ?? `region-${index}`,
    ...readWorldPosition(region.position, width, height, center),
    radius: Math.max(26, (readNumber(region.radius) ?? 0.12) * Math.min(width, height)),
    terrain: readString(region.terrain) ?? 'commons',
    vitality: clamp01(readNumber(region.vitality) ?? snapshot.qualities.biosphere),
    openness: clamp01(readNumber(region.openness) ?? snapshot.qualities.plurality),
    seed: readNumber(region.glyphSeed) ?? snapshot.seed + index * 229,
  } satisfies AgencyRegionSite));
  const locationById = buildLocationIndex(center, settlements, regions, hints, width, height);
  const pressures = hints.pressures.map((pressure, index) => {
    const position = readWorldPosition(pressure.position, width, height, center);
    return {
      id: readString(pressure.id) ?? `pressure-${index}`,
      ...position,
      radius: Math.max(22, (readNumber(pressure.radius) ?? 0.1) * Math.min(width, height)),
      severity: clamp01(readNumber(pressure.severity) ?? 0.5),
      momentum: clamp01(readNumber(pressure.momentum) ?? 0.5),
      kind: readString(pressure.kind) ?? 'unknown',
      focus: readString(pressure.focus) ?? 'coherence',
      affectedIds: readStrings(pressure.affectedIds),
      seed: readNumber(pressure.glyphSeed) ?? snapshot.seed + index * 251,
    } satisfies PressureSite;
  });
  const arrivals = hints.arrivals.map((arrival, index) => {
    const origin = resolveLocation(arrival.origin, locationById, width, height, center);
    const destination = resolveLocation(arrival.destination, locationById, width, height, center);
    const timeToArrival = Math.max(0, readNumber(arrival.timeToArrival) ?? 0);
    const status = readString(arrival.status) ?? 'travelling';
    const progress = status === 'arrived' ? 1 : clamp01(1 - timeToArrival / Math.max(12, timeToArrival + 24));
    return {
      id: readString(arrival.id) ?? `arrival-${index}`,
      origin,
      destination,
      progress,
      status,
      gifts: readStrings(arrival.gifts),
      needs: readStrings(arrival.needs),
      seed: readNumber(arrival.glyphSeed) ?? snapshot.seed + index * 277,
    } satisfies ArrivalSite;
  });
  const artifacts = [
    ...buildAgencyArtifacts(hints.inventions, 'invention', width, height, center, snapshot.seed),
    ...buildAgencyArtifacts(hints.laws, 'law', width, height, center, snapshot.seed + 401),
    ...buildAgencyArtifacts(hints.cultures, 'culture', width, height, center, snapshot.seed + 809),
    ...buildAgencyArtifacts(hints.sites, 'site', width, height, center, snapshot.seed + 1201),
    ...buildAgencyArtifacts(hints.settlements, 'habitat', width, height, center, snapshot.seed + 1601),
  ];
  const pulseRecord = asRecord(hints.lastAction?.pulse);
  const lastAction = pulseRecord ? {
    verb: readString(pulseRecord.verb) ?? 'changed',
    origin: resolveLocation(pulseRecord.origin, locationById, width, height, center),
    destination: resolveLocation(pulseRecord.destination, locationById, width, height, center),
    color: readString(pulseRecord.color) ?? '#efc45a',
    magnitude: clamp01(readNumber(pulseRecord.magnitude) ?? 0.6),
    seed: readNumber(pulseRecord.seed) ?? snapshot.seed + snapshot.cycle * 313,
  } satisfies ActionPulseSite : null;
  const derivedPopulation = Math.round(settlements.reduce((sum, site) => sum + site.population, 0));

  return {
    width,
    height,
    center,
    mountain,
    river,
    tributaries,
    terrain,
    settlements,
    settlementByVoice,
    routes,
    works,
    laws,
    culture,
    regions,
    pressures,
    arrivals,
    artifacts,
    lastAction,
    totalPopulation: hints.population ?? derivedPopulation,
    inventionCount: hints.inventions.length + snapshot.works.filter((work) => inventionKinds.has(work.kind)).length,
    futureMotifs: hints.motifs,
  };
}

function buildSettlements(
  snapshot: SimulationSnapshot,
  hints: FutureWorldHints,
  marginX: number,
  marginTop: number,
  usableWidth: number,
  usableHeight: number,
  center: WorldPoint,
): SettlementSite[] {
  const hintedByVoice = new Map<VoiceId, LooseRecord>();
  for (const hint of hints.settlements) {
    const voice = readVoiceId(hint.voiceId ?? hint.voice ?? hint.faction ?? hint.id);
    if (voice) hintedByVoice.set(voice, hint);
  }

  const working = snapshot.voices.map((state, index): SettlementSite => {
    const definition = VOICE_BY_ID[state.id];
    const hint = hintedByVoice.get(state.id);
    const nx = readNormalizedCoordinate(hint?.x ?? asRecord(hint?.position)?.x);
    const ny = readNormalizedCoordinate(hint?.y ?? asRecord(hint?.position)?.y);
    const baseX = nx ?? 0.12 + hashUnit(snapshot.seed + definition.glyphSeed, 201 + index) * 0.76;
    const baseY = ny ?? 0.12 + hashUnit(snapshot.seed + definition.glyphSeed, 301 + index) * 0.72;
    const epochDriftX = Math.sin(snapshot.epoch * 0.73 + definition.glyphSeed) * usableWidth * 0.012;
    const epochDriftY = Math.cos(snapshot.epoch * 0.57 + definition.glyphSeed) * usableHeight * 0.012;
    const participantWorks = snapshot.works.filter((work) => work.participants.includes(state.id));
    const hintedPopulation = readNumber(hint?.population ?? hint?.people ?? hint?.inhabitants);
    const population = Math.max(7, hintedPopulation ?? Math.round(18 + state.presence * 46 + state.mutations * 7 + participantWorks.length * 3.5));
    const tier = Math.max(1, Math.min(6, 1 + Math.floor((participantWorks.length + snapshot.epoch * 2 + state.mutations) / 4)));
    return {
      voiceId: state.id,
      name: readString(hint?.name) ?? definition.shortName,
      x: marginX + baseX * usableWidth + epochDriftX,
      y: marginTop + baseY * usableHeight + epochDriftY,
      population,
      tier,
      radius: 24 + tier * 5 + Math.sqrt(population) * 1.7,
      culture: Math.min(1, 0.22 + state.mutations * 0.09 + participantWorks.length * 0.035 + snapshot.qualities.plurality * 0.32),
      ecology: Math.min(1, snapshot.qualities.biosphere * 0.55 + definition.affinities.biosphere * 0.45),
      seed: snapshot.seed + definition.glyphSeed * 149,
    };
  });

  // The locations are seeded, but a small deterministic relaxation keeps them
  // reading as inhabitable districts rather than seven vertices on a diagram.
  for (let pass = 0; pass < 6; pass += 1) {
    for (let i = 0; i < working.length; i += 1) {
      const site = working[i] as SettlementSite;
      const fromCenterX = site.x - center.x;
      const fromCenterY = site.y - center.y;
      const centerDistance = Math.max(1, Math.hypot(fromCenterX, fromCenterY));
      if (centerDistance < 90) {
        site.x += (fromCenterX / centerDistance) * (90 - centerDistance) * 0.22;
        site.y += (fromCenterY / centerDistance) * (90 - centerDistance) * 0.22;
      }
      for (let j = i + 1; j < working.length; j += 1) {
        const other = working[j] as SettlementSite;
        const dx = other.x - site.x;
        const dy = other.y - site.y;
        const distance = Math.max(0.01, Math.hypot(dx, dy));
        const minimum = (site.radius + other.radius) * 0.78;
        if (distance >= minimum) continue;
        const push = (minimum - distance) * 0.24;
        site.x -= (dx / distance) * push;
        site.y -= (dy / distance) * push;
        other.x += (dx / distance) * push;
        other.y += (dy / distance) * push;
      }
    }
  }
  return working;
}

function buildTerrain(snapshot: SimulationSnapshot, width: number, height: number, center: WorldPoint, mountain: WorldPoint): TerrainPatch[] {
  const patches: TerrainPatch[] = [];
  const count = 42 + Math.round(snapshot.qualities.biosphere * 18);
  const wetness = snapshot.qualities.biosphere * (1 - snapshot.knobs.ecologicalPressure * 0.42);
  const cultivation = Math.min(0.34, (snapshot.works.length + snapshot.archivedWorkCount * 0.2) / 90);
  for (let index = 0; index < count; index += 1) {
    const x = hashUnit(snapshot.seed, 1300 + index) * width;
    const y = hashUnit(snapshot.seed, 1400 + index) * height;
    const roll = hashUnit(snapshot.seed + snapshot.epoch * 29, 1500 + index);
    const mountainDistance = Math.hypot(x - mountain.x, y - mountain.y) / Math.max(width, height);
    const centerDistance = Math.hypot(x - center.x, y - center.y) / Math.max(width, height);
    let kind: BiomeKind;
    if (snapshot.knobs.ecologicalPressure > 0.66 && roll < snapshot.knobs.ecologicalPressure * 0.2) kind = 'scarland';
    else if (mountainDistance < 0.18 && roll < 0.66) kind = 'stone';
    else if (centerDistance < 0.28 && roll < cultivation + 0.18) kind = 'cultivated';
    else if (roll < wetness * 0.22) kind = 'wetland';
    else if (roll < 0.2 + wetness * 0.46) kind = 'canopy';
    else if (roll < 0.78) kind = 'meadow';
    else kind = 'stone';
    patches.push({
      x,
      y,
      rx: 35 + hashUnit(snapshot.seed, 1600 + index) * 115,
      ry: 24 + hashUnit(snapshot.seed, 1700 + index) * 78,
      rotation: hashSigned(snapshot.seed, 1800 + index) * 0.6,
      roughness: 0.4 + hashUnit(snapshot.seed, 1900 + index) * 0.6,
      kind,
      seed: snapshot.seed + index * 173,
    });
  }
  return patches;
}

function buildLocationIndex(
  center: WorldPoint,
  settlements: SettlementSite[],
  regions: AgencyRegionSite[],
  hints: FutureWorldHints,
  width: number,
  height: number,
): Map<string, WorldPoint> {
  const locations = new Map<string, WorldPoint>([['commons', center]]);
  settlements.forEach((site) => {
    locations.set(site.voiceId, site);
    locations.set(site.name, site);
  });
  regions.forEach((region) => locations.set(region.id, region));
  for (const collection of [hints.settlements, hints.inventions, hints.sites, hints.laws, hints.cultures]) {
    for (const item of collection) {
      const id = readString(item.id);
      if (id) locations.set(id, readWorldPosition(item.position, width, height, center));
    }
  }
  return locations;
}

function buildAgencyArtifacts(
  records: LooseRecord[],
  domain: AgencyArtifactSite['domain'],
  width: number,
  height: number,
  center: WorldPoint,
  seed: number,
): AgencyArtifactSite[] {
  return records.slice(-64).map((artifact, index) => {
    const form = readString(artifact.form ?? artifact.kind);
    const traits = readStrings(artifact.traits);
    if (form && !traits.includes(form)) traits.unshift(form);
    const maturity = readNumber(artifact.maturity ?? artifact.adoption ?? artifact.strength ?? artifact.intensity);
    const resilience = readNumber(artifact.resilience ?? artifact.reliability ?? artifact.permeability);
    return {
      id: readString(artifact.id) ?? `${domain}-${index}`,
      domain,
      title: readString(artifact.title ?? artifact.name) ?? domain,
      ...readWorldPosition(artifact.position, width, height, {
        x: center.x + hashSigned(seed, 2300 + index) * width * 0.22,
        y: center.y + hashSigned(seed, 2400 + index) * height * 0.2,
      }),
      maturity: clamp01(maturity ?? 0.5),
      risk: clamp01(readNumber(artifact.risk) ?? (resilience === undefined ? 0 : 1 - resilience)),
      traits,
      regionId: readString(artifact.regionId),
      seed: readNumber(artifact.glyphSeed) ?? seed + index * 307,
    };
  });
}

function resolveLocation(
  value: unknown,
  locations: Map<string, WorldPoint>,
  width: number,
  height: number,
  fallback: WorldPoint,
): WorldPoint {
  if (typeof value === 'string') return locations.get(value) ?? fallback;
  const record = asRecord(value);
  if (record) {
    const id = readString(record.id ?? record.regionId ?? record.settlementId);
    if (id && locations.has(id)) return locations.get(id) as WorldPoint;
  }
  return readWorldPosition(value, width, height, fallback);
}

function readWorldPosition(value: unknown, width: number, height: number, fallback: WorldPoint): WorldPoint {
  const record = asRecord(value);
  const nx = readNormalizedCoordinate(record?.x);
  const ny = readNormalizedCoordinate(record?.y);
  return {
    x: nx === undefined ? fallback.x : nx * width,
    y: ny === undefined ? fallback.y : ny * height,
  };
}

function buildRiver(seed: number, width: number, height: number, center: WorldPoint, epoch: number): WorldPoint[] {
  const points: WorldPoint[] = [];
  const yStart = height * (0.3 + hashUnit(seed, 2001) * 0.35);
  const bias = (center.y - yStart) * 0.26;
  for (let step = -2; step <= 34; step += 1) {
    const t = step / 32;
    const x = t * width;
    const broad = Math.sin(t * Math.PI * (1.6 + hashUnit(seed, 2002)) + hashUnit(seed, 2003) * Math.PI * 2) * height * 0.09;
    const fine = Math.sin(t * Math.PI * 7 + seed * 0.001 + epoch * 0.04) * height * 0.016;
    points.push({ x, y: yStart + broad + fine + bias * Math.sin(t * Math.PI) });
  }
  return points;
}

function buildTributary(seed: number, start: WorldPoint, end: WorldPoint): WorldPoint[] {
  const points: WorldPoint[] = [];
  for (let step = 0; step <= 12; step += 1) {
    const t = step / 12;
    const bend = Math.sin(t * Math.PI) * hashSigned(seed, 2101) * 34;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    points.push({
      x: start.x + dx * t + (-dy / distance) * bend,
      y: start.y + dy * t + (dx / distance) * bend,
    });
  }
  return points;
}

function nearestPoint(points: WorldPoint[], target: WorldPoint): WorldPoint {
  return points.reduce((nearest, point) => Math.hypot(point.x - target.x, point.y - target.y) < Math.hypot(nearest.x - target.x, nearest.y - target.y) ? point : nearest, points[0] ?? target);
}

function readFutureHints(snapshot: SimulationSnapshot): FutureWorldHints {
  const raw = snapshot as SimulationSnapshot & LooseRecord;
  const civilization = asRecord(raw.civilization);
  const agency = asRecord(raw.agency);
  const settlements = readRecords(agency?.settlements ?? raw.settlements ?? civilization?.settlements ?? raw.habitats ?? civilization?.habitats);
  const inventions = readRecords(agency?.inventions ?? raw.inventions ?? civilization?.inventions ?? raw.technologies ?? civilization?.technologies);
  const regions = readRecords(agency?.regions);
  const pressures = readRecords(agency?.pressures);
  const arrivals = readRecords(agency?.arrivals);
  const sites = readRecords(agency?.sites);
  const laws = readRecords(agency?.charterLaws);
  const cultures = readRecords(agency?.cultures);
  const lastAction = asRecord(agency?.lastAction);
  const culture = asRecord(raw.culture ?? civilization?.culture ?? agency?.worldCondition);
  const motifs = readStrings(culture?.motifs ?? culture?.symbols ?? raw.culturalMotifs ?? civilization?.culturalMotifs);
  const population = readNumber(raw.population ?? civilization?.population ?? agency?.population);
  return { settlements, inventions, regions, pressures, arrivals, sites, laws, cultures, lastAction, motifs, population };
}

function readRecords(value: unknown): LooseRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter((entry): entry is LooseRecord => Boolean(entry)) : [];
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').slice(0, 24) : [];
}

function asRecord(value: unknown): LooseRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as LooseRecord : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readNormalizedCoordinate(value: unknown): number | undefined {
  const number = readNumber(value);
  if (number === undefined) return undefined;
  if (number >= 0 && number <= 1) return number;
  if (number >= -1 && number <= 1) return (number + 1) / 2;
  return undefined;
}

function readVoiceId(value: unknown): VoiceId | null {
  return typeof value === 'string' && VOICE_IDS.includes(value as VoiceId) ? value as VoiceId : null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const inventionKinds = new Set<CivicWorkKind>([
  'shared-word',
  'consent-protocol',
  'ecological-covenant',
  'translation-braid',
]);
