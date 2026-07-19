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

function text(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maximum) : '';
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

export class NanoGamemasterClient {
  readonly model = 'gpt-5.4-nano';
  private listeners = new Set<StatusListener>();
  private _status: NanoStatus = 'quiet';
  private activeController: AbortController | null = null;

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
    if (this._status === 'thinking') this.setStatus('quiet');
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

  private setStatus(status: NanoStatus): void {
    if (this._status === status) return;
    this._status = status;
    for (const listener of this.listeners) listener(status);
  }
}
