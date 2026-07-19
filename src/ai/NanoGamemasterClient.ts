import { VOICE_BY_ID } from '../simulation/content';
import type { SimulationSnapshot, VoiceId } from '../simulation/types';

export type NanoProposalMode = 'shared-minimum' | 'carry-difference' | 'reversible-trial';
export type NanoWorkKind =
  | 'shared-word'
  | 'listening-ritual'
  | 'consent-protocol'
  | 'memory-practice'
  | 'ecological-covenant'
  | 'open-question'
  | 'witness-circle'
  | 'translation-braid';
export type NanoMotif = 'braid' | 'ring' | 'scar' | 'current' | 'constellation' | 'threshold' | 'mycelium';
export type NanoGeometry = 'radial' | 'braided' | 'branching' | 'orbital' | 'layered';
export type NanoMotion = 'breathe' | 'drift' | 'pulse' | 'ripple' | 'still';

export interface NanoArtDirection {
  motif: NanoMotif;
  geometry: NanoGeometry;
  motion: NanoMotion;
  palette: string[];
  density: number;
  symmetry: number;
  texture: string;
  caption: string;
}

export interface NanoProposalDirection {
  mode: NanoProposalMode;
  title: string;
  summary: string;
  decision: string;
  cost: string;
  workKind: NanoWorkKind;
  art: NanoArtDirection;
}

export interface NanoCouncilDirection {
  councilName: string;
  voices: { voiceId: VoiceId; statement: string }[];
  proposals: NanoProposalDirection[];
  gamemasters: {
    illustrator: string;
    architect: string;
    storyweaver: string;
  };
  worldLine: string;
}

export type NanoCivicKind = 'arrival' | 'foresee' | 'consequence';
export type NanoCivicDomain = 'law' | 'culture' | 'invention' | 'habitat';
export type NanoCivicVerb = 'seed' | 'bind' | 'shelter' | 'translate' | 'reroute' | 'invite' | 'amend' | 'compost' | 'refuse';
export type NanoCivicMethod = 'witness' | 'prototype' | 'ritual' | 'boundary' | 'reciprocity' | 'remembrance' | 'play';

export interface NanoCivicOption {
  title: string;
  domain: NanoCivicDomain;
  verb: NanoCivicVerb;
  method: NanoCivicMethod;
  promise: string;
  risk: string;
  visualHook: string;
}

export interface NanoCivicDirection {
  title: string;
  publicName: string;
  description: string;
  doctrineOrBlueprint: string;
  worldLine: string;
  costNarrative: string;
  consequence: string;
  dissent: string;
  humanThread: {
    communityName: string;
    originMemory: string;
    skills: [string, string, string];
    needs: [string, string];
    vow: string;
  };
  visualDirection: {
    palette: [string, string, string, string];
    architecture: 'woven' | 'terraced' | 'mycelial' | 'vaulted' | 'nomadic' | 'amphibious' | 'canopy' | 'earthen';
    material: string;
    motif: 'braid' | 'ring' | 'scar' | 'current' | 'constellation' | 'threshold' | 'mycelium' | 'canopy' | 'delta' | 'terrace';
    motion: 'breathe' | 'drift' | 'pulse' | 'ripple' | 'gather' | 'migrate' | 'unfurl';
    weather: string;
    landmark: string;
  };
  gamemasters: {
    illustrator: string;
    ecologist: string;
    anthropologist: string;
    inventor: string;
  };
  options: [NanoCivicOption, NanoCivicOption, NanoCivicOption];
}

export type NanoStatus = 'quiet' | 'thinking' | 'connected' | 'fallback';
type StatusListener = (status: NanoStatus) => void;

const MODES = new Set<NanoProposalMode>(['shared-minimum', 'carry-difference', 'reversible-trial']);
const WORK_KINDS = new Set<NanoWorkKind>([
  'shared-word',
  'listening-ritual',
  'consent-protocol',
  'memory-practice',
  'ecological-covenant',
  'open-question',
  'witness-circle',
  'translation-braid',
]);
const MOTIFS = new Set<NanoMotif>(['braid', 'ring', 'scar', 'current', 'constellation', 'threshold', 'mycelium']);
const GEOMETRIES = new Set<NanoGeometry>(['radial', 'braided', 'branching', 'orbital', 'layered']);
const MOTIONS = new Set<NanoMotion>(['breathe', 'drift', 'pulse', 'ripple', 'still']);
const VOICE_IDS = new Set<VoiceId>([
  'pioneers',
  'innovators',
  'cultivators',
  'harbingers',
  'guardians',
  'ecostewards',
  'mountaineers',
]);
const CIVIC_DOMAINS = new Set<NanoCivicDomain>(['law', 'culture', 'invention', 'habitat']);
const CIVIC_VERBS = new Set<NanoCivicVerb>(['seed', 'bind', 'shelter', 'translate', 'reroute', 'invite', 'amend', 'compost', 'refuse']);
const CIVIC_METHODS = new Set<NanoCivicMethod>(['witness', 'prototype', 'ritual', 'boundary', 'reciprocity', 'remembrance', 'play']);
const CIVIC_ARCHITECTURES = new Set<NanoCivicDirection['visualDirection']['architecture']>([
  'woven', 'terraced', 'mycelial', 'vaulted', 'nomadic', 'amphibious', 'canopy', 'earthen',
]);
const CIVIC_MOTIFS = new Set<NanoCivicDirection['visualDirection']['motif']>([
  'braid', 'ring', 'scar', 'current', 'constellation', 'threshold', 'mycelium', 'canopy', 'delta', 'terrace',
]);
const CIVIC_MOTIONS = new Set<NanoCivicDirection['visualDirection']['motion']>([
  'breathe', 'drift', 'pulse', 'ripple', 'gather', 'migrate', 'unfurl',
]);

function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maximum) return cleaned;
  const clipped = cleaned.slice(0, maximum + 1);
  const sentenceEnd = Math.max(
    clipped.lastIndexOf('.'),
    clipped.lastIndexOf('!'),
    clipped.lastIndexOf('?'),
    clipped.lastIndexOf('…'),
  );
  if (sentenceEnd >= maximum * 0.55) return clipped.slice(0, sentenceEnd + 1).trim();
  const wordEnd = clipped.lastIndexOf(' ', maximum - 1);
  const boundary = wordEnd >= maximum * 0.45 ? wordEnd : maximum;
  return `${clipped.slice(0, boundary).replace(/[\s,;:\-]+$/g, '')}…`;
}

function validateDirection(value: unknown): NanoCouncilDirection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const rawVoices = Array.isArray(source.voices) ? source.voices : [];
  const rawProposals = Array.isArray(source.proposals) ? source.proposals : [];
  const rawMasters = source.gamemasters && typeof source.gamemasters === 'object'
    ? source.gamemasters as Record<string, unknown>
    : {};
  if (rawVoices.length !== 2 || rawProposals.length !== 3) return null;

  const voices = rawVoices.map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const voiceId = text(record.voiceId, 24) as VoiceId;
    const statement = text(record.statement, 180);
    return VOICE_IDS.has(voiceId) && statement ? { voiceId, statement } : null;
  });
  if (voices.some((voice) => !voice)) return null;
  if (new Set(voices.map((voice) => voice?.voiceId)).size !== 2) return null;

  const proposals = rawProposals.map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const rawArt = record.art && typeof record.art === 'object' ? record.art as Record<string, unknown> : {};
    const mode = text(record.mode, 32) as NanoProposalMode;
    const workKind = text(record.workKind, 32) as NanoWorkKind;
    const motif = text(rawArt.motif, 24) as NanoMotif;
    const geometry = text(rawArt.geometry, 24) as NanoGeometry;
    const motion = text(rawArt.motion, 24) as NanoMotion;
    const palette = Array.isArray(rawArt.palette)
      ? rawArt.palette.slice(0, 3).map((color) => text(color, 7)).filter((color) => /^#[0-9a-f]{6}$/i.test(color))
      : [];
    const density = Math.max(0, Math.min(1, Number(rawArt.density) || 0));
    const symmetry = Math.max(0, Math.min(1, Number(rawArt.symmetry) || 0));
    const texture = text(rawArt.texture, 56);
    const caption = text(rawArt.caption, 130);
    const title = text(record.title, 52);
    const summary = text(record.summary, 190);
    const decision = text(record.decision, 150);
    const cost = text(record.cost, 110);
    if (
      !MODES.has(mode) ||
      !WORK_KINDS.has(workKind) ||
      !MOTIFS.has(motif) ||
      !GEOMETRIES.has(geometry) ||
      !MOTIONS.has(motion) ||
      palette.length !== 3 ||
      !title ||
      !summary ||
      !decision ||
      !cost ||
      !texture ||
      !caption
    ) return null;
    return {
      mode,
      title,
      summary,
      decision,
      cost,
      workKind,
      art: { motif, geometry, motion, palette, density, symmetry, texture, caption },
    };
  });
  if (proposals.some((proposal) => !proposal)) return null;
  if (new Set(proposals.map((proposal) => proposal?.mode)).size !== MODES.size) return null;

  const result: NanoCouncilDirection = {
    councilName: text(source.councilName, 56),
    voices: voices as { voiceId: VoiceId; statement: string }[],
    proposals: proposals as NanoProposalDirection[],
    gamemasters: {
      illustrator: text(rawMasters.illustrator, 160),
      architect: text(rawMasters.architect, 160),
      storyweaver: text(rawMasters.storyweaver, 160),
    },
    worldLine: text(source.worldLine, 170),
  };
  return result.councilName && result.worldLine && Object.values(result.gamemasters).every(Boolean) ? result : null;
}

function textTuple(value: unknown, length: number, maximum: number): string[] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  const values = value.map((item) => text(item, maximum));
  return values.every(Boolean) ? values : null;
}

function validateCivicDirection(value: unknown): NanoCivicDirection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const human = source.humanThread && typeof source.humanThread === 'object'
    ? source.humanThread as Record<string, unknown>
    : {};
  const visual = source.visualDirection && typeof source.visualDirection === 'object'
    ? source.visualDirection as Record<string, unknown>
    : {};
  const masters = source.gamemasters && typeof source.gamemasters === 'object'
    ? source.gamemasters as Record<string, unknown>
    : {};
  const architecture = text(visual.architecture, 24) as NanoCivicDirection['visualDirection']['architecture'];
  const motif = text(visual.motif, 24) as NanoCivicDirection['visualDirection']['motif'];
  const motion = text(visual.motion, 24) as NanoCivicDirection['visualDirection']['motion'];
  const palette = textTuple(visual.palette, 4, 7);
  const skills = textTuple(human.skills, 3, 36);
  const needs = textTuple(human.needs, 2, 44);
  if (
    !palette || palette.some((color) => !/^#[0-9a-f]{6}$/i.test(color)) ||
    !skills || !needs ||
    !CIVIC_ARCHITECTURES.has(architecture) ||
    !CIVIC_MOTIFS.has(motif) ||
    !CIVIC_MOTIONS.has(motion)
  ) return null;

  const rawOptions = Array.isArray(source.options) ? source.options : [];
  if (rawOptions.length !== 3) return null;
  const options = rawOptions.map((item): NanoCivicOption | null => {
    const option = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const domain = text(option.domain, 24) as NanoCivicDomain;
    const verb = text(option.verb, 24) as NanoCivicVerb;
    const method = text(option.method, 24) as NanoCivicMethod;
    const title = text(option.title, 52);
    const promise = text(option.promise, 140);
    const risk = text(option.risk, 120);
    const visualHook = text(option.visualHook, 100);
    return CIVIC_DOMAINS.has(domain) && CIVIC_VERBS.has(verb) && CIVIC_METHODS.has(method) && title && promise && risk && visualHook
      ? { title, domain, verb, method, promise, risk, visualHook }
      : null;
  });
  if (options.some((option) => !option)) return null;

  const direction: NanoCivicDirection = {
    title: text(source.title, 58),
    publicName: text(source.publicName, 38),
    description: text(source.description, 240),
    doctrineOrBlueprint: text(source.doctrineOrBlueprint, 220),
    worldLine: text(source.worldLine, 170),
    costNarrative: text(source.costNarrative, 130),
    consequence: text(source.consequence, 180),
    dissent: text(source.dissent, 150),
    humanThread: {
      communityName: text(human.communityName, 38),
      originMemory: text(human.originMemory, 160),
      skills: skills as [string, string, string],
      needs: needs as [string, string],
      vow: text(human.vow, 120),
    },
    visualDirection: {
      palette: palette as [string, string, string, string],
      architecture,
      material: text(visual.material, 48),
      motif,
      motion,
      weather: text(visual.weather, 60),
      landmark: text(visual.landmark, 90),
    },
    gamemasters: {
      illustrator: text(masters.illustrator, 150),
      ecologist: text(masters.ecologist, 150),
      anthropologist: text(masters.anthropologist, 150),
      inventor: text(masters.inventor, 150),
    },
    options: options as [NanoCivicOption, NanoCivicOption, NanoCivicOption],
  };
  const required = [
    direction.title,
    direction.publicName,
    direction.description,
    direction.doctrineOrBlueprint,
    direction.worldLine,
    direction.costNarrative,
    direction.consequence,
    direction.dissent,
    direction.humanThread.communityName,
    direction.humanThread.originMemory,
    direction.humanThread.vow,
    direction.visualDirection.material,
    direction.visualDirection.weather,
    direction.visualDirection.landmark,
    ...Object.values(direction.gamemasters),
  ];
  return required.every(Boolean) ? direction : null;
}

export class NanoGamemasterClient {
  readonly model = 'gpt-5.4-nano';
  private listeners = new Set<StatusListener>();
  private _status: NanoStatus = 'quiet';
  private activeController: AbortController | null = null;
  private civicControllers = new Map<NanoCivicKind, AbortController>();
  private civicCache = new Map<string, NanoCivicDirection>();

  get status(): NanoStatus {
    return this._status;
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this._status);
    return () => this.listeners.delete(listener);
  }

  cancel(): void {
    this.activeController?.abort();
    this.activeController = null;
    for (const controller of this.civicControllers.values()) controller.abort();
    this.civicControllers.clear();
    if (this._status === 'thinking') this.setStatus('quiet');
  }

  arrive(snapshot: SimulationSnapshot): Promise<NanoCivicDirection | null> {
    return this.requestCivic('arrival', snapshot, { trigger: 'humans enter Nolybab' });
  }

  foresee(snapshot: SimulationSnapshot, selection: unknown): Promise<NanoCivicDirection | null> {
    return this.requestCivic('foresee', snapshot, { selection });
  }

  imagine(snapshot: SimulationSnapshot, input: unknown, result?: unknown): Promise<NanoCivicDirection | null> {
    return this.requestCivic('consequence', snapshot, { input, result });
  }

  async convene(snapshot: SimulationSnapshot, pair: [VoiceId, VoiceId]): Promise<NanoCouncilDirection | null> {
    const question = snapshot.currentQuestion;
    if (!question) return null;
    this.cancel();
    const controller = new AbortController();
    this.activeController = controller;
    this.setStatus('thinking');

    const expanded = snapshot as SimulationSnapshot & {
      works?: { title?: string; kind?: string; status?: string }[];
    };
    const requestBody = {
      seedPhrase: snapshot.seedPhrase,
      epoch: snapshot.epoch,
      epochName: snapshot.epochName,
      question: {
        id: question.id,
        title: question.title,
        situation: question.situation,
        prompt: question.prompt,
        focus: question.focus,
      },
      pair,
      voiceNotes: pair.map((voiceId) => {
        const voice = VOICE_BY_ID[voiceId];
        return `${voice.shortName}: gift—${voice.gift}; shadow—${voice.shadow}; lens—${voice.lens}`;
      }),
      rememberedLessons: snapshot.lessons
        .filter((lesson) => !lesson.resolved)
        .slice(-4)
        .map((lesson) => `${lesson.title}: ${lesson.account}`),
      livingLaws: snapshot.laws.slice(-4).map((law) => `${law.title}: ${law.text}`),
      existingWorks: (expanded.works ?? []).slice(-8).map((work) => `${work.title ?? work.kind ?? 'civic work'} (${work.status ?? 'rooted'})`),
      civicQualities: snapshot.qualities,
    };

    const timeout = window.setTimeout(() => controller.abort(), 16_000);
    try {
      const response = await fetch('/api/gamemaster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as { available?: boolean; direction?: unknown } | null;
      const direction = response.ok && payload?.available ? validateDirection(payload.direction) : null;
      this.setStatus(direction ? 'connected' : 'fallback');
      return direction;
    } catch {
      if (this.activeController === controller) this.setStatus('fallback');
      return null;
    } finally {
      window.clearTimeout(timeout);
      if (this.activeController === controller) this.activeController = null;
    }
  }

  private async requestCivic(
    kind: NanoCivicKind,
    snapshot: SimulationSnapshot,
    trigger: Record<string, unknown>,
  ): Promise<NanoCivicDirection | null> {
    const context = this.civicContext(snapshot, trigger);
    const cacheKey = `${kind}:${snapshot.seed}:${snapshot.cycle}:${JSON.stringify(trigger)}`;
    const cached = this.civicCache.get(cacheKey);
    if (cached) return cached;

    this.civicControllers.get(kind)?.abort();
    const controller = new AbortController();
    this.civicControllers.set(kind, controller);
    this.setStatus('thinking');
    const timeout = window.setTimeout(() => controller.abort(), 17_000);
    try {
      const response = await fetch('/api/nano-civic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, context }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as { available?: boolean; direction?: unknown } | null;
      const direction = response.ok && payload?.available ? validateCivicDirection(payload.direction) : null;
      if (direction) {
        this.civicCache.set(cacheKey, direction);
        if (this.civicCache.size > 36) this.civicCache.delete(this.civicCache.keys().next().value ?? '');
      }
      this.setStatus(direction ? 'connected' : 'fallback');
      return direction;
    } catch {
      if (this.civicControllers.get(kind) === controller) this.setStatus('fallback');
      return null;
    } finally {
      window.clearTimeout(timeout);
      if (this.civicControllers.get(kind) === controller) this.civicControllers.delete(kind);
    }
  }

  private civicContext(snapshot: SimulationSnapshot, trigger: Record<string, unknown>): Record<string, unknown> {
    const expanded = snapshot as SimulationSnapshot & {
      agency?: {
        resources?: unknown;
        pressures?: unknown[];
        regions?: unknown[];
        settlements?: unknown[];
        inventions?: unknown[];
        charterLaws?: unknown[];
        cultures?: unknown[];
        arrivals?: unknown[];
        sites?: unknown[];
        actionHistory?: unknown[];
        variety?: number;
        worldCondition?: string;
      };
    };
    const agency = expanded.agency;
    const names = [
      ...(agency?.regions ?? []),
      ...(agency?.settlements ?? []),
      ...(agency?.inventions ?? []),
      ...(agency?.charterLaws ?? []),
      ...(agency?.cultures ?? []),
      ...(agency?.arrivals ?? []),
      ...(agency?.sites ?? []),
      ...snapshot.works,
      ...snapshot.laws,
      ...snapshot.lexicon,
    ].slice(-90).map((item) => {
      if (!item || typeof item !== 'object') return '';
      const record = item as unknown as Record<string, unknown>;
      return text(record.name ?? record.title ?? record.word, 64);
    }).filter(Boolean);
    return {
      seedPhrase: snapshot.seedPhrase,
      epoch: snapshot.epoch,
      epochName: snapshot.epochName,
      cycle: snapshot.cycle,
      phase: snapshot.civicPhase,
      question: snapshot.currentQuestion,
      qualities: snapshot.qualities,
      world: {
        resources: agency?.resources,
        condition: agency?.worldCondition,
        variety: agency?.variety,
      },
      humans: {
        arrivals: agency?.arrivals?.slice(-5),
        settlements: agency?.settlements?.slice(-8),
      },
      ecologyAndPlace: {
        regions: agency?.regions?.slice(-9),
        pressures: agency?.pressures?.slice(-6),
        sites: agency?.sites?.slice(-10),
      },
      civilization: {
        inventions: agency?.inventions?.slice(-8),
        laws: agency?.charterLaws?.slice(-8),
        cultures: agency?.cultures?.slice(-8),
        recentActions: agency?.actionHistory?.slice(-10),
      },
      existingNamesDoNotRepeat: names,
      trigger,
    };
  }

  private setStatus(status: NanoStatus): void {
    if (this._status === status) return;
    this._status = status;
    for (const listener of this.listeners) listener(status);
  }
}
