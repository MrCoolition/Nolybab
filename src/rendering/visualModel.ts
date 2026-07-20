import { VOICE_BY_ID } from '../simulation/content';
import type {
  CivicSite,
  CivicWork,
  CulturalPractice,
  LivingLaw,
  ProceduralArtDirection,
  Settlement,
  SimulationSnapshot,
  VoiceId,
  WorldRegion,
} from '../simulation/types';

export interface WorldPoint {
  x: number;
  y: number;
}

export interface DioramaBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export type BiomeKind = 'wetland' | 'canopy' | 'meadow' | 'stone' | 'cultivated' | 'scarland';

export interface TerrainPatch extends WorldPoint {
  rx: number;
  ry: number;
  rotation: number;
  kind: BiomeKind;
  vitality: number;
  seed: number;
}

export interface RegionSite extends WorldPoint {
  id: string;
  name: string;
  terrain: WorldRegion['terrain'];
  radius: number;
  vitality: number;
  openness: number;
  pressure: number;
  traits: string[];
  seed: number;
}

/** A real, inhabited place from snapshot.agency.settlements. */
export interface SettlementSite extends WorldPoint {
  id: string;
  name: string;
  form: Settlement['form'];
  inhabitants: number;
  maturity: number;
  resilience: number;
  openness: number;
  foundedBy: VoiceId[];
  description: string;
  traits: string[];
  palette: string[];
  radius: number;
  seed: number;
}

/** Civic voices are mobile guild crews, never seven abstract settlements. */
export interface GuildCrewSite extends WorldPoint {
  voiceId: VoiceId;
  name: string;
  color: string;
  population: number;
  activity: 'building' | 'tending' | 'mapping' | 'welcoming' | 'repairing' | 'watching' | 'exploring';
  seed: number;
}

export interface WorkSite extends WorldPoint {
  id: string;
  title: string;
  kind: CivicWork['kind'];
  maturity: number;
  status: CivicWork['status'];
  participants: VoiceId[];
  art: ProceduralArtDirection;
  construction: number;
  seed: number;
}

export interface ArtifactSite extends WorldPoint {
  id: string;
  domain: 'law' | 'culture' | 'invention' | 'site';
  title: string;
  kind: string;
  maturity: number;
  risk: number;
  participants: VoiceId[];
  traits: string[];
  palette: string[];
  status: string;
  seed: number;
}

export interface RouteSite {
  id: string;
  start: WorldPoint;
  control: WorldPoint;
  end: WorldPoint;
  strength: number;
  kind: 'footpath' | 'trade' | 'migration' | 'water-channel';
  a?: VoiceId;
  b?: VoiceId;
  seed: number;
}

export interface ArrivalSite {
  id: string;
  name: string;
  kind: string;
  origin: WorldPoint;
  destination: WorldPoint;
  progress: number;
  status: string;
  partySize: number;
  urgency: number;
  gifts: string[];
  needs: string[];
  traits: string[];
  palette: string[];
  seed: number;
}

export interface PressureSite extends WorldPoint {
  id: string;
  title: string;
  radius: number;
  severity: number;
  momentum: number;
  kind: string;
  focus: string;
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

export interface TreeSite extends WorldPoint {
  size: number;
  kind: 'tree' | 'fruit' | 'reed' | 'sapling';
  vitality: number;
  seed: number;
}

export interface FieldSite extends WorldPoint {
  width: number;
  height: number;
  rotation: number;
  crop: 'grain' | 'beans' | 'orchard' | 'wetland';
  maturity: number;
  seed: number;
}

export interface BridgeSite extends WorldPoint {
  angle: number;
  length: number;
  maturity: number;
  seed: number;
}

export interface VisualWorldLayout {
  width: number;
  height: number;
  bounds: DioramaBounds;
  center: WorldPoint;
  river: WorldPoint[];
  tributaries: WorldPoint[][];
  terrain: TerrainPatch[];
  regions: RegionSite[];
  settlements: SettlementSite[];
  guilds: GuildCrewSite[];
  works: WorkSite[];
  artifacts: ArtifactSite[];
  routes: RouteSite[];
  arrivals: ArrivalSite[];
  pressures: PressureSite[];
  trees: TreeSite[];
  fields: FieldSite[];
  bridges: BridgeSite[];
  commons: WorldPoint;
  lastAction: ActionPulseSite | null;
  totalPopulation: number;
  inventionCount: number;
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function readPalette(art: ProceduralArtDirection | undefined, fallback: string[]): string[] {
  if (!art?.palette?.length) return fallback;
  return [...new Set([...art.palette.filter((entry) => /^#[0-9a-f]{6}$/i.test(entry)), ...fallback])].slice(0, 5);
}

function mapPoint(point: { x: number; y: number } | undefined, bounds: DioramaBounds, fallback: WorldPoint): WorldPoint {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return fallback;
  return {
    x: bounds.left + (0.06 + clamp01(point.x) * 0.88) * bounds.width,
    y: bounds.top + (0.07 + clamp01(point.y) * 0.86) * bounds.height,
  };
}

function buildBounds(width: number, height: number): DioramaBounds {
  const left = Math.max(26, width * 0.025);
  const right = width - left;
  // The world remains visible between the narrative masthead and command deck.
  const top = Math.max(74, Math.min(124, height * 0.145));
  const bottomInset = Math.max(116, Math.min(156, height * 0.205));
  const bottom = Math.max(top + 280, height - bottomInset);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function buildRiver(seed: number, bounds: DioramaBounds): WorldPoint[] {
  const points: WorldPoint[] = [];
  const base = bounds.top + bounds.height * (0.48 + hashSigned(seed, 201) * 0.06);
  for (let index = -2; index <= 34; index += 1) {
    const t = index / 32;
    points.push({
      x: bounds.left + t * bounds.width,
      y: base
        + Math.sin(t * Math.PI * 2.15 + hashUnit(seed, 202) * Math.PI * 2) * bounds.height * 0.105
        + Math.sin(t * Math.PI * 6.2 + seed * 0.0003) * bounds.height * 0.018,
    });
  }
  return points;
}

function polylinePoint(points: WorldPoint[], t: number): WorldPoint {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };
  const scaled = clamp01(t) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const a = points[index]!;
  const b = points[index + 1]!;
  return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local };
}

function nearestRiverT(river: WorldPoint[], point: WorldPoint): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  river.forEach((candidate, index) => {
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (distance < bestDistance) {
      best = index / Math.max(1, river.length - 1);
      bestDistance = distance;
    }
  });
  return best;
}

function curveBetween(start: WorldPoint, end: WorldPoint, seed: number, pull = 0.16): WorldPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const bend = hashSigned(seed, 490) * Math.min(62, distance * pull);
  return {
    x: (start.x + end.x) * 0.5 - (dy / distance) * bend,
    y: (start.y + end.y) * 0.5 + (dx / distance) * bend,
  };
}

export function buildVisualWorld(snapshot: SimulationSnapshot, width: number, height: number): VisualWorldLayout {
  const bounds = buildBounds(width, height);
  const center = { x: bounds.left + bounds.width * 0.51, y: bounds.top + bounds.height * 0.52 };
  const agency = snapshot.agency;

  const regions = agency.regions.map((region, index): RegionSite => ({
    id: region.id,
    name: region.name,
    terrain: region.terrain,
    ...mapPoint(region.position, bounds, center),
    radius: Math.max(48, Math.min(116, region.radius * Math.min(bounds.width, bounds.height) * 1.18)),
    vitality: clamp01(region.vitality),
    openness: clamp01(region.openness),
    pressure: clamp01(region.pressure),
    traits: [...region.traits],
    seed: region.glyphSeed || snapshot.seed + index * 109,
  }));
  const regionById = new Map(regions.map((region) => [region.id, region]));
  const commonsRegion = regions.find((region) => region.terrain === 'commons') ?? regions[0];
  const commons = commonsRegion ? { x: commonsRegion.x, y: commonsRegion.y } : center;

  const settlements = agency.settlements.map((settlement, index): SettlementSite => {
    const region = regionById.get(settlement.regionId);
    const position = mapPoint(settlement.position, bounds, region ?? commons);
    const maturity = clamp01(settlement.maturity);
    const inhabitants = Math.max(0, Math.floor(settlement.inhabitants));
    return {
      id: settlement.id,
      name: settlement.name,
      form: settlement.form,
      inhabitants,
      maturity,
      resilience: clamp01(settlement.resilience),
      openness: clamp01(settlement.openness),
      foundedBy: [...settlement.foundedBy],
      description: settlement.description,
      traits: [...settlement.traits],
      palette: readPalette(settlement.visualDirection, ['#e9b85c', '#f4e6bd', '#4f8971']),
      radius: Math.max(44, Math.min(116, 38 + Math.sqrt(Math.max(3, inhabitants)) * 4.4 + maturity * 32)),
      seed: settlement.glyphSeed || snapshot.seed + index * 137,
      ...position,
    };
  });
  const primaryHabitat = settlements.slice().sort((a, b) => b.inhabitants - a.inhabitants)[0];
  const guildActivities: GuildCrewSite['activity'][] = ['building', 'mapping', 'tending', 'watching', 'repairing', 'welcoming', 'exploring'];
  const guilds = snapshot.voices.map((voice, index): GuildCrewSite => {
    const definition = VOICE_BY_ID[voice.id];
    const home = settlements.find((settlement) => settlement.foundedBy.includes(voice.id)) ?? primaryHabitat;
    const region = regions[(index * 3 + 1) % Math.max(1, regions.length)];
    const anchor = home ?? region ?? commons;
    const angle = hashUnit(snapshot.seed + definition.glyphSeed, 610 + index) * Math.PI * 2;
    const distance = 26 + hashUnit(snapshot.seed, 650 + index) * Math.max(36, Math.min(86, bounds.height * 0.17));
    return {
      voiceId: voice.id,
      name: definition.shortName,
      color: definition.cssColor,
      population: Math.max(2, Math.round(2 + voice.presence * 7 + voice.mutations * 1.5)),
      activity: guildActivities[index % guildActivities.length]!,
      x: Math.max(bounds.left + 26, Math.min(bounds.right - 26, anchor.x + Math.cos(angle) * distance)),
      y: Math.max(bounds.top + 24, Math.min(bounds.bottom - 22, anchor.y + Math.sin(angle) * distance * 0.58)),
      seed: snapshot.seed + definition.glyphSeed * 173,
    };
  });
  const guildByVoice = new Map(guilds.map((guild) => [guild.voiceId, guild]));

  const works = snapshot.works.slice(-28).map((work, index): WorkSite => {
    const anchors = work.participants.map((id) => guildByVoice.get(id)).filter((value): value is GuildCrewSite => Boolean(value));
    const anchor = anchors.length
      ? anchors.reduce((sum, item) => ({ x: sum.x + item.x / anchors.length, y: sum.y + item.y / anchors.length }), { x: 0, y: 0 })
      : commons;
    const angle = hashUnit(work.glyphSeed, 720 + index) * Math.PI * 2;
    const spread = 26 + (index % 5) * 11;
    const newest = index === Math.min(27, snapshot.works.length - 1);
    return {
      id: work.id,
      title: work.title,
      kind: work.kind,
      maturity: clamp01(work.maturity),
      status: work.status,
      participants: [...work.participants],
      art: work.art,
      construction: newest && (snapshot.civicPhase === 'action' || snapshot.civicPhase === 'growth')
        ? snapshot.civicPhase === 'growth' ? 0.84 : Math.max(0.18, 1 - snapshot.actionSeconds / 10)
        : 1,
      x: Math.max(bounds.left + 22, Math.min(bounds.right - 22, anchor.x + Math.cos(angle) * spread)),
      y: Math.max(bounds.top + 20, Math.min(bounds.bottom - 20, anchor.y + Math.sin(angle) * spread * 0.58)),
      seed: work.glyphSeed + index * 181,
    };
  });

  const artifacts: ArtifactSite[] = [];
  const pushArtifact = (
    record: { id: string; position: { x: number; y: number }; glyphSeed: number; traits?: string[]; visualDirection: ProceduralArtDirection },
    domain: ArtifactSite['domain'],
    title: string,
    kind: string,
    maturity: number,
    risk: number,
    participants: VoiceId[],
    status: string,
  ) => {
    artifacts.push({
      id: record.id,
      domain,
      title,
      kind,
      maturity: clamp01(maturity),
      risk: clamp01(risk),
      participants,
      traits: [...(record.traits ?? [])],
      palette: readPalette(record.visualDirection, domain === 'law'
        ? ['#f6cc70', '#f7ead0', '#bd694f']
        : domain === 'culture' ? ['#d87fb7', '#f2d89c', '#4f9f8e']
          : domain === 'invention' ? ['#64bad1', '#f4ca63', '#e9f0d7']
            : ['#70ad76', '#f2ddad', '#b56e4d']),
      status,
      seed: record.glyphSeed,
      ...mapPoint(record.position, bounds, commons),
    });
  };
  agency.inventions.forEach((item) => pushArtifact(item, 'invention', item.name, item.principle, item.maturity, item.risk, item.createdBy, 'working'));
  agency.charterLaws.forEach((item: LivingLaw) => pushArtifact(item, 'law', item.name, item.text, item.strength, 1 - item.contestability, item.authoredBy, item.amendments ? 'amended' : 'living'));
  agency.cultures.forEach((item: CulturalPractice) => pushArtifact(item, 'culture', item.name, item.practice, item.adoption, 1 - item.diversity, item.carriers, item.mutations ? 'mutating' : 'living'));
  agency.sites.forEach((item: CivicSite) => pushArtifact(item, 'site', item.title, item.kind, item.intensity, 1 - item.permeability, item.participants, item.status));

  const routes: RouteSite[] = [];
  // Paths are physical routes between inhabited places and the commons.
  settlements.forEach((settlement, index) => {
    if (Math.hypot(settlement.x - commons.x, settlement.y - commons.y) < 14) return;
    routes.push({
      id: `habitat-path-${settlement.id}`,
      start: settlement,
      control: curveBetween(settlement, commons, settlement.seed),
      end: commons,
      strength: 0.45 + settlement.openness * 0.45,
      kind: 'footpath',
      seed: settlement.seed + index * 31,
    });
  });
  snapshot.relationships.filter((item) => item.exchanges > 0 || item.strength > 0.58).slice(-14).forEach((relationship, index) => {
    const start = guildByVoice.get(relationship.a);
    const end = guildByVoice.get(relationship.b);
    if (!start || !end) return;
    routes.push({
      id: `${relationship.a}:${relationship.b}`,
      start,
      control: curveBetween(start, end, snapshot.seed + index * 73, 0.12),
      end,
      strength: clamp01(relationship.strength),
      kind: 'trade',
      a: relationship.a,
      b: relationship.b,
      seed: snapshot.seed + index * 233,
    });
  });

  const river = buildRiver(snapshot.seed, bounds);
  const tributaries = settlements.filter((settlement) => settlement.maturity > 0.16 || settlement.inhabitants > 8).slice(0, 6).map((settlement, index) => {
    const riverPoint = polylinePoint(river, nearestRiverT(river, settlement));
    const points: WorldPoint[] = [];
    const control = curveBetween(settlement, riverPoint, settlement.seed + 890 + index, 0.2);
    for (let step = 0; step <= 12; step += 1) {
      const t = step / 12;
      const one = 1 - t;
      points.push({
        x: one * one * settlement.x + 2 * one * t * control.x + t * t * riverPoint.x,
        y: one * one * settlement.y + 2 * one * t * control.y + t * t * riverPoint.y,
      });
    }
    routes.push({ id: `channel-${settlement.id}`, start: settlement, control, end: riverPoint, strength: settlement.maturity, kind: 'water-channel', seed: settlement.seed + 907 });
    return points;
  });

  const arrivals = agency.arrivals.map((arrival, index): ArrivalSite => {
    const origin = mapPoint(arrival.origin, bounds, { x: bounds.left - 50, y: commons.y });
    const destination = mapPoint(arrival.destination, bounds, regionById.get(arrival.regionId) ?? commons);
    const denominator = Math.max(24, arrival.timeToArrival + 30);
    const terminal = ['settled', 'welcomed', 'diverted', 'refused'].includes(arrival.status);
    return {
      id: arrival.id,
      name: arrival.name,
      kind: arrival.kind,
      origin,
      destination,
      progress: terminal ? 1 : clamp01(1 - arrival.timeToArrival / denominator),
      status: arrival.status,
      partySize: Math.max(0, arrival.partySize),
      urgency: clamp01(arrival.urgency),
      gifts: [...arrival.gifts],
      needs: [...arrival.needs],
      traits: [...arrival.traits],
      palette: readPalette(arrival.visualDirection, ['#f4d06f', '#e77858', '#7ec9bc']),
      seed: arrival.glyphSeed || snapshot.seed + index * 277,
    };
  });

  const pressures = agency.pressures.filter((pressure) => pressure.state === 'active' || pressure.state === 'emerging').map((pressure, index): PressureSite => ({
    id: pressure.id,
    title: pressure.title,
    ...mapPoint(pressure.position, bounds, commons),
    radius: Math.max(34, pressure.radius * Math.min(bounds.width, bounds.height) * 0.9),
    severity: clamp01(pressure.severity),
    momentum: clamp01(pressure.momentum),
    kind: pressure.kind,
    focus: pressure.focus,
    seed: pressure.glyphSeed || snapshot.seed + index * 283,
  }));

  const terrain: TerrainPatch[] = [];
  regions.forEach((region, index) => {
    const kind: BiomeKind = region.terrain === 'wetland' || region.terrain === 'delta' ? 'wetland'
      : region.terrain === 'canopy' ? 'canopy'
        : region.terrain === 'highland' || region.terrain === 'ruin' ? 'stone'
          : region.pressure > 0.62 ? 'scarland'
            : region.terrain === 'commons' ? 'cultivated' : 'meadow';
    terrain.push({ x: region.x, y: region.y, rx: region.radius * 1.15, ry: region.radius * 0.62, rotation: hashSigned(region.seed, 310) * 0.25, kind, vitality: region.vitality, seed: region.seed + index * 47 });
  });
  for (let index = 0; index < 20; index += 1) {
    const roll = hashUnit(snapshot.seed, 3300 + index);
    terrain.push({
      x: bounds.left + hashUnit(snapshot.seed, 3400 + index) * bounds.width,
      y: bounds.top + hashUnit(snapshot.seed, 3500 + index) * bounds.height,
      rx: 38 + hashUnit(snapshot.seed, 3600 + index) * 82,
      ry: 20 + hashUnit(snapshot.seed, 3700 + index) * 42,
      rotation: hashSigned(snapshot.seed, 3800 + index) * 0.45,
      kind: roll < 0.18 ? 'canopy' : roll < 0.28 ? 'wetland' : roll < 0.72 ? 'meadow' : roll < 0.9 ? 'stone' : 'cultivated',
      vitality: snapshot.qualities.biosphere,
      seed: snapshot.seed + index * 311,
    });
  }

  const trees: TreeSite[] = [];
  const treeCount = 72 + Math.floor(snapshot.qualities.biosphere * 70);
  for (let index = 0; index < treeCount; index += 1) {
    const x = bounds.left + hashUnit(snapshot.seed, 4100 + index) * bounds.width;
    const y = bounds.top + hashUnit(snapshot.seed, 4300 + index) * bounds.height;
    const nearHabitat = settlements.some((settlement) => Math.hypot(x - settlement.x, y - settlement.y) < settlement.radius * 0.72);
    const nearCommons = Math.hypot(x - commons.x, y - commons.y) < 42;
    if (nearHabitat || nearCommons) continue;
    const vitality = clamp01(snapshot.qualities.biosphere + hashSigned(snapshot.seed, 4500 + index) * 0.22);
    trees.push({
      x,
      y,
      size: 4.5 + hashUnit(snapshot.seed, 4600 + index) * 9,
      kind: index % 13 === 0 ? 'fruit' : index % 17 === 0 ? 'reed' : vitality < 0.36 ? 'sapling' : 'tree',
      vitality,
      seed: snapshot.seed + index * 389,
    });
  }

  const fields: FieldSite[] = settlements.flatMap((settlement, index) => {
    const count = Math.max(1, Math.min(4, Math.ceil(settlement.inhabitants / 28) + (settlement.maturity > 0.48 ? 1 : 0)));
    return Array.from({ length: count }, (_, fieldIndex): FieldSite => {
      const side = fieldIndex % 2 === 0 ? 1 : -1;
      return {
        x: Math.max(bounds.left + 22, Math.min(bounds.right - 22, settlement.x + side * (settlement.radius * 0.72 + 22 + Math.floor(fieldIndex / 2) * 26))),
        y: Math.max(bounds.top + 18, Math.min(bounds.bottom - 18, settlement.y + 18 + (fieldIndex % 3) * 19)),
        width: 30 + Math.min(32, settlement.inhabitants * 0.45),
        height: 17 + settlement.maturity * 13,
        rotation: hashSigned(settlement.seed, 4800 + fieldIndex) * 0.17,
        crop: (['grain', 'beans', 'orchard', 'wetland'] as const)[(index + fieldIndex) % 4]!,
        maturity: clamp01(0.35 + settlement.maturity * 0.6),
        seed: settlement.seed + fieldIndex * 419,
      };
    });
  });

  const bridges: BridgeSite[] = [];
  const bridgeCount = Math.max(1, Math.min(5, 1 + Math.floor(agency.inventions.length / 2) + agency.sites.filter((site) => site.kind === 'crossing').length));
  for (let index = 0; index < bridgeCount; index += 1) {
    const t = 0.28 + (index + 1) / (bridgeCount + 2) * 0.48;
    const point = polylinePoint(river, t);
    const before = polylinePoint(river, Math.max(0, t - 0.015));
    const after = polylinePoint(river, Math.min(1, t + 0.015));
    bridges.push({
      ...point,
      angle: Math.atan2(after.y - before.y, after.x - before.x) + Math.PI / 2,
      length: 34 + index * 4,
      maturity: clamp01(0.45 + agency.inventions.length * 0.08 + snapshot.qualities.reciprocity * 0.25),
      seed: snapshot.seed + index * 443,
    });
  }

  const pulse = agency.lastAction?.pulse;
  const lastAction = pulse ? {
    verb: pulse.verb,
    origin: mapPoint(pulse.origin, bounds, commons),
    destination: mapPoint(pulse.destination, bounds, commons),
    color: pulse.color,
    magnitude: pulse.magnitude,
    seed: pulse.seed,
  } : null;

  return {
    width,
    height,
    bounds,
    center,
    river,
    tributaries,
    terrain,
    regions,
    settlements,
    guilds,
    works,
    artifacts,
    routes,
    arrivals,
    pressures,
    trees,
    fields,
    bridges,
    commons,
    lastAction,
    totalPopulation: settlements.reduce((sum, settlement) => sum + settlement.inhabitants, 0),
    inventionCount: agency.inventions.length + snapshot.works.filter((work) => ['shared-word', 'consent-protocol', 'ecological-covenant', 'translation-braid'].includes(work.kind)).length,
  };
}
