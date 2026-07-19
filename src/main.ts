import Phaser from 'phaser';
import './styles.css';
import { LivingSoundscape } from './audio/LivingSoundscape';
import { NolybabScene } from './rendering/NolybabScene';
import { NolybabSimulation } from './simulation/NolybabSimulation';
import { NolybabHud } from './ui/NolybabHud';

const restored = NolybabSimulation.load();
const simulation = restored ?? new NolybabSimulation('the right to begin again');
if (!restored) {
  simulation.setPaused(true);
  simulation.clearSave();
}
const scene = new NolybabScene(simulation);
const soundscape = new LivingSoundscape();

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

new NolybabHud(simulation, scene, soundscape, Boolean(restored));

declare global {
  interface Window {
    __NOLYBAB__?: {
      simulation: NolybabSimulation;
      game: Phaser.Game;
    };
  }
}

window.__NOLYBAB__ = { simulation, game };
