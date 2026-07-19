import Phaser from 'phaser';
import './styles.css';
import { NanoGamemasterClient } from './ai/NanoGamemasterClient';
import { LivingSoundscape } from './audio/LivingSoundscape';
import { WorldArchiveClient } from './persistence/WorldArchiveClient';
import { NolybabScene } from './rendering/NolybabScene';
import { NolybabSimulation } from './simulation/NolybabSimulation';
import { NolybabHud } from './ui/NolybabHud';

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
