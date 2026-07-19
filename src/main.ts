import Phaser from 'phaser';
import './styles.css';
import { NanoGamemasterClient, type NanoCivicDirection, type NanoCivicKind } from './ai/NanoGamemasterClient';
import { LivingSoundscape } from './audio/LivingSoundscape';
import { WorldArchiveClient } from './persistence/WorldArchiveClient';
import { NolybabScene } from './rendering/NolybabScene';
import { NolybabSimulation } from './simulation/NolybabSimulation';
import type {
  NanoArrivalDirection,
  NanoCivicDirection as SimulationNanoCivicDirection,
  ProceduralArtDirection,
  SimulationSnapshot,
} from './simulation/types';
import { NolybabHud } from './ui/NolybabHud';

interface NanoRequestDetail {
  kind?: NanoCivicKind;
  snapshot?: SimulationSnapshot;
  input?: unknown;
  result?: unknown;
  selection?: unknown;
  requestId?: string;
}

function recordId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const candidate = record.actionId ?? record.id ?? record.workId ?? record.artifactId;
  return typeof candidate === 'string' && candidate ? candidate : null;
}

function translateVisual(direction: NanoCivicDirection): ProceduralArtDirection {
  const source = direction.visualDirection;
  const motif = source.motif === 'canopy'
    ? 'mycelium'
    : source.motif === 'delta'
      ? 'current'
      : source.motif === 'terrace'
        ? 'threshold'
        : source.motif;
  const geometryByArchitecture: Record<typeof source.architecture, ProceduralArtDirection['geometry']> = {
    woven: 'braided',
    terraced: 'layered',
    mycelial: 'branching',
    vaulted: 'radial',
    nomadic: 'orbital',
    amphibious: 'braided',
    canopy: 'branching',
    earthen: 'layered',
  };
  const motion = source.motion === 'gather' || source.motion === 'migrate'
    ? 'drift'
    : source.motion === 'unfurl'
      ? 'breathe'
      : source.motion;
  return {
    motif,
    geometry: geometryByArchitecture[source.architecture],
    motion,
    palette: source.palette,
    density: 0.72,
    symmetry: source.architecture === 'vaulted' ? 0.76 : source.architecture === 'nomadic' ? 0.24 : 0.48,
    texture: `${source.material}; ${source.weather}`.slice(0, 96),
    caption: source.landmark,
  };
}

function correlateDirection(
  snapshot: SimulationSnapshot,
  result: unknown,
  direction: NanoCivicDirection,
): SimulationNanoCivicDirection | null {
  if (!result || typeof result !== 'object') return null;
  const record = result as Record<string, unknown>;
  const actionId = typeof record.id === 'string' ? record.id : recordId(result);
  const createdIds = Array.isArray(record.createdIds)
    ? record.createdIds.filter((id): id is string => typeof id === 'string')
    : [];
  const artifactId = createdIds[0];
  if (!actionId || !artifactId) return null;
  const artifacts = [
    ...snapshot.agency.settlements,
    ...snapshot.agency.inventions,
    ...snapshot.agency.charterLaws,
    ...snapshot.agency.cultures,
    ...snapshot.agency.sites,
    ...snapshot.agency.arrivals,
  ];
  const artifact = artifacts.find((candidate) => candidate.id === artifactId);
  if (!artifact) return null;
  return {
    model: 'gpt-5.4-nano',
    actionId,
    artifactId,
    baseRevision: artifact.revision,
    name: direction.publicName,
    description: direction.description,
    worldLine: direction.worldLine,
    visualDirection: translateVisual(direction),
  };
}

function arrivalDirection(direction: NanoCivicDirection): NanoArrivalDirection {
  return {
    model: 'gpt-5.4-nano',
    name: direction.humanThread.communityName,
    description: `${direction.humanThread.originMemory} ${direction.description}`.slice(0, 360),
    traits: [
      ...direction.humanThread.skills.map((skill) => `skill: ${skill}`),
      ...direction.humanThread.needs.map((need) => `needs: ${need}`),
      direction.humanThread.vow,
    ].map((trait) => trait.slice(0, 32)),
    visualDirection: translateVisual(direction),
  };
}

function bindLivingAtelier(simulation: NolybabSimulation, nano: NanoGamemasterClient): void {
  window.addEventListener('nolybab:nano-request', (event) => {
    const detail = (event as CustomEvent<NanoRequestDetail>).detail ?? {};
    const kind = detail.kind;
    if (!kind) return;
    const snapshot = detail.snapshot ?? simulation.snapshot;
    const requestId = detail.requestId ?? `${kind}:${snapshot.cycle}:${Date.now()}`;
    const generation = kind === 'arrival'
      ? nano.arrive(snapshot)
      : kind === 'foresee'
        ? nano.foresee(snapshot, detail.selection ?? detail.input)
        : nano.imagine(snapshot, detail.input, detail.result);

    void generation.then((direction) => {
      if (direction) {
        if (kind === 'arrival') {
          const arrival = simulation.snapshot.agency.arrivals.find((candidate) => candidate.kind === 'people' && candidate.status === 'approaching');
          if (arrival) simulation.applyNanoArrivalDirection(arrival.id, arrival.revision, arrivalDirection(direction));
        } else if (kind === 'consequence') {
          const enrichment = correlateDirection(snapshot, detail.result, direction);
          if (enrichment) simulation.applyNanoCivicDirection(enrichment.actionId, enrichment);
        }
      }
      window.dispatchEvent(new CustomEvent('nolybab:nano-response', {
        detail: {
          kind,
          direction,
          input: detail.input,
          result: detail.result,
          selection: detail.selection,
          requestId,
        },
      }));
    });
  });
}

async function bootstrap(): Promise<void> {
  const archive = new WorldArchiveClient();
  const archiveStatus = document.getElementById('archive-status');
  archive.subscribe((status) => {
    if (!archiveStatus) return;
    const labels = {
      local: 'local memory',
      restoring: 'seeking deep memory',
      saving: 'rooting in Neon',
      rooted: 'Neon memory rooted',
      offline: 'local memory · archive waiting',
    } as const;
    archiveStatus.dataset.status = status;
    archiveStatus.innerHTML = `<i></i> ${labels[status]}`;
  });

  const local = NolybabSimulation.load();
  const remoteState = await archive.restore();
  const remoteIsNewer = remoteState && (!local || remoteState.cycle > local.snapshot.cycle || remoteState.elapsed > local.snapshot.elapsed + 2);
  const restored = remoteIsNewer ? new NolybabSimulation(remoteState.seedPhrase, remoteState) : local;
  const simulation = restored ?? new NolybabSimulation('the right to begin again');
  // Nothing evolves behind the arrival veil. The player begins or resumes the breath explicitly.
  simulation.setPaused(true);
  if (!restored) {
    simulation.clearSave();
  }

  const scene = new NolybabScene(simulation);
  const soundscape = new LivingSoundscape();
  const nano = new NanoGamemasterClient();
  bindLivingAtelier(simulation, nano);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-canvas',
    transparent: true,
    backgroundColor: '#0b1210',
    scene: [scene],
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: false,
      powerPreference: 'high-performance',
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    fps: {
      target: 60,
      smoothStep: true,
    },
  });

  new NolybabHud(simulation, scene, soundscape, nano, Boolean(restored));
  archive.attach(simulation);
  window.__NOLYBAB__ = { simulation, game };
}

declare global {
  interface Window {
    __NOLYBAB__?: {
      simulation: NolybabSimulation;
      game: Phaser.Game;
    };
  }
}

void bootstrap();
