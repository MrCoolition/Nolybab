import Phaser from 'phaser';
import { QUALITY_META, VOICES, VOICE_BY_ID } from '../simulation/content';
import { clamp } from '../simulation/random';
import type { NolybabSimulation } from '../simulation/NolybabSimulation';
import type { CivicTargetKind, CivicTargetRef, CivicWork, SimulationSnapshot, VoiceId, WeaveOutcome } from '../simulation/types';
import {
  buildVisualWorld,
  hashSigned,
  hashUnit,
  type AgencyArtifactSite,
  type AgencyRegionSite,
  type ArrivalSite,
  type PressureSite,
  type RouteSite,
  type SettlementSite,
  type VisualWorldLayout,
  type WorkSite,
  type WorldPoint,
} from './visualModel';

interface HitArea extends WorldPoint {
  radius: number;
}

interface DustMote {
  x: number;
  y: number;
  phase: number;
  size: number;
  speed: number;
}

interface CameraRig {
  x: number;
  y: number;
  zoom: number;
}

interface WorldTargetHit extends HitArea {
  target: CivicTargetRef;
  scaleY: number;
}

const VOID = 0x07100d;
const DEEP_VOID = 0x030806;
const SOIL = 0x1b251e;
const LOAM = 0x2c3528;
const BONE = 0xe8ddbd;
const STONE = 0x6c6658;
const WATER = 0x43a99e;
const DEEP_WATER = 0x173d3c;
const SCAR = 0xe3664e;
const GROWTH = 0x91b66b;
const SUN = 0xefc45a;
const NIGHT_BLUE = 0x132322;

export class NolybabScene extends Phaser.Scene {
  readonly simulation: NolybabSimulation;
  onVoiceSelected?: (voice: VoiceId) => void;
  onLessonSelected?: (lessonId: string) => void;
  onHoverVoice?: (voice: VoiceId | null, point?: WorldPoint) => void;
  onCivicTargetSelected?: (target: CivicTargetRef) => void;
  onHoverCivicTarget?: (target: CivicTargetRef | null, point?: WorldPoint) => void;

  private terrain!: Phaser.GameObjects.Graphics;
  private world!: Phaser.GameObjects.Graphics;
  private light!: Phaser.GameObjects.Graphics;
  private labels = new Map<VoiceId, Phaser.GameObjects.Text>();
  private selectionLabels = new Map<VoiceId, Phaser.GameObjects.Text>();
  private commonsLabel!: Phaser.GameObjects.Text;
  private eventLabel!: Phaser.GameObjects.Text;
  private voicePositions = new Map<VoiceId, HitArea>();
  private lessonPositions = new Map<string, HitArea>();
  private civicTargetHits: WorldTargetHit[] = [];
  private selectedVoices: VoiceId[] = [];
  private selectedLessonId: string | null = null;
  private selectedCivicTarget: CivicTargetRef | null = null;
  private hoveredVoice: VoiceId | null = null;
  private dust: DustMote[] = [];
  private reducedMotion = false;
  private outcomeFx: { outcome: WeaveOutcome; startedAt: number } | null = null;
  private layout: VisualWorldLayout | null = null;
  private layoutKey = '';
  private terrainKey = '';
  private cameraRig: CameraRig = { x: 0, y: 0, zoom: 1 };
  private previousPhase = '';

  constructor(simulation: NolybabSimulation) {
    super({ key: 'NolybabScene' });
    this.simulation = simulation;
  }

  setSelectedVoices(voices: VoiceId[]): void {
    this.selectedVoices = voices;
  }

  setSelectedLesson(lessonId: string | null): void {
    this.selectedLessonId = lessonId;
  }

  setSelectedCivicTarget(target: CivicTargetRef | null): void {
    this.selectedCivicTarget = target;
  }

  playOutcome(outcome: WeaveOutcome): void {
    this.outcomeFx = { outcome, startedAt: this.time.now / 1000 };
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#07100d');
    this.terrain = this.add.graphics().setDepth(0);
    this.world = this.add.graphics().setDepth(2);
    this.light = this.add.graphics().setDepth(3);
    this.light.setBlendMode(Phaser.BlendModes.ADD);
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.createDust();
    this.createLabels();
    this.cameraRig = { x: this.scale.width / 2, y: this.scale.height / 2, zoom: 1 };

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer));
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer));
    this.scale.on('resize', () => {
      this.layoutKey = '';
      this.terrainKey = '';
    });
  }

  update(timeMs: number, deltaMs: number): void {
    this.simulation.update(deltaMs / 1000);
    this.renderWorld(this.simulation.snapshot, timeMs / 1000, deltaMs / 1000);
  }

  private createDust(): void {
    let value = this.simulation.snapshot.seed || 1;
    const next = () => {
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      return (value >>> 0) / 4294967296;
    };
    this.dust = Array.from({ length: 82 }, () => ({
      x: next(),
      y: next(),
      phase: next() * Math.PI * 2,
      size: 0.45 + next() * 1.5,
      speed: 0.16 + next() * 0.6,
    }));
  }

  private createLabels(): void {
    for (const voice of VOICES) {
      const label = this.add.text(0, 0, '', {
        fontFamily: 'Palatino Linotype, Iowan Old Style, Georgia, serif',
        fontSize: '13px',
        color: voice.cssColor,
        align: 'center',
        lineSpacing: 2,
        shadow: { color: '#020705', blur: 7, fill: true, offsetX: 0, offsetY: 2 },
      }).setOrigin(0.5, 0).setDepth(7);
      this.labels.set(voice.id, label);

      const seat = this.add.text(0, 0, '', {
        fontFamily: 'Cascadia Mono, Consolas, monospace',
        fontSize: '9px',
        color: '#07100d',
        backgroundColor: '#e8ddbd',
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5).setDepth(9).setVisible(false);
      this.selectionLabels.set(voice.id, seat);
    }

    this.commonsLabel = this.add.text(0, 0, '', {
      fontFamily: 'Cascadia Mono, Consolas, monospace',
      fontSize: '9px',
      color: '#b9b09a',
      align: 'center',
      letterSpacing: 1.2,
      shadow: { color: '#020705', blur: 6, fill: true, offsetX: 0, offsetY: 2 },
    }).setOrigin(0.5, 0).setDepth(6);

    this.eventLabel = this.add.text(0, 0, '', {
      fontFamily: 'Palatino Linotype, Iowan Old Style, Georgia, serif',
      fontSize: '12px',
      fontStyle: 'italic',
      color: '#efc45a',
      align: 'center',
      backgroundColor: 'rgba(7,16,13,0.78)',
      padding: { x: 9, y: 5 },
    }).setOrigin(0.5, 1).setDepth(8).setVisible(false);
  }

  private renderWorld(snapshot: SimulationSnapshot, time: number, delta: number): void {
    const width = this.scale.width;
    const height = this.scale.height;
    if (width < 2 || height < 2) return;
    const agency = (snapshot as SimulationSnapshot & { agency?: unknown }).agency;
    const agencySignature = this.safeAgencySignature(agency);
    const relationshipSignature = snapshot.relationships.map((relationship) => `${Math.round(relationship.strength * 20)}:${relationship.exchanges}`).join(',');
    const layoutKey = [
      snapshot.seed,
      width,
      height,
      snapshot.epoch,
      snapshot.cycle,
      snapshot.civicPhase,
      snapshot.works.length,
      snapshot.lessons.length,
      snapshot.lexicon.length,
      snapshot.laws.length,
      Math.floor(snapshot.actionSeconds * 5),
      relationshipSignature,
      agencySignature,
    ].join('|');
    if (layoutKey !== this.layoutKey || !this.layout) {
      this.layout = buildVisualWorld(snapshot, width, height);
      this.layoutKey = layoutKey;
    }
    const layout = this.layout;

    const terrainKey = [
      snapshot.seed,
      width,
      height,
      snapshot.epoch,
      Math.floor(snapshot.qualities.biosphere * 10),
      Math.floor(snapshot.knobs.ecologicalPressure * 10),
      layout.regions.map((region) => `${region.id}:${Math.round(region.vitality * 10)}:${region.terrain}`).join(','),
    ].join('|');
    if (terrainKey !== this.terrainKey) {
      this.drawTerrain(snapshot, layout);
      this.terrainKey = terrainKey;
    }

    this.world.clear();
    this.light.clear();
    this.voicePositions.clear();
    this.lessonPositions.clear();
    this.civicTargetHits = [];

    this.drawAmbientLife(snapshot, layout, time);
    this.drawRegions(snapshot, layout, time);
    this.drawWater(snapshot, layout, time);
    this.drawPressureFronts(layout.pressures, time);
    this.drawRoutes(snapshot, layout, time);
    this.drawCommons(snapshot, layout, time);
    this.drawCivicWorks(snapshot, layout, time);
    this.drawAgencyArtifacts(layout.artifacts, time);
    this.drawSettlements(snapshot, layout, time);
    this.drawArrivals(layout.arrivals, time);
    this.drawScars(snapshot, layout, time);
    this.drawCulture(snapshot, layout, time);
    this.drawActionPulse(snapshot, layout, time);
    this.drawCivicTargetSelection(time);
    this.drawOutcomeFx(time, layout);
    this.updateLabels(snapshot, layout);
    this.updateCamera(snapshot, layout, delta);
    this.previousPhase = snapshot.civicPhase;
  }

  private drawTerrain(snapshot: SimulationSnapshot, layout: VisualWorldLayout): void {
    const { width, height } = layout;
    this.terrain.clear();
    this.terrain.fillStyle(DEEP_VOID, 1);
    this.terrain.fillRect(-width * 0.45, -height * 0.45, width * 1.9, height * 1.9);

    const horizonBands = 18;
    for (let band = horizonBands; band >= 0; band -= 1) {
      const progress = band / horizonBands;
      const color = mixColor(VOID, NIGHT_BLUE, progress * (0.34 + snapshot.qualities.biosphere * 0.16));
      this.terrain.fillStyle(color, 0.22);
      this.terrain.fillEllipse(layout.center.x, layout.center.y, width * (0.66 + progress * 0.9), height * (0.5 + progress * 0.8));
    }

    const biomeColors: Record<string, number> = {
      wetland: 0x173c36,
      canopy: 0x203a2b,
      meadow: 0x303a29,
      stone: 0x34352f,
      cultivated: 0x40392a,
      scarland: 0x3f2923,
    };
    for (const patch of layout.terrain) {
      const points: Phaser.Geom.Point[] = [];
      const segments = 18;
      for (let step = 0; step < segments; step += 1) {
        const angle = (step / segments) * Math.PI * 2;
        const roughness = 1 + Math.sin(angle * 3 + patch.seed) * 0.11 * patch.roughness + Math.cos(angle * 7 - patch.seed) * 0.055;
        const localX = Math.cos(angle) * patch.rx * roughness;
        const localY = Math.sin(angle) * patch.ry * roughness;
        const cos = Math.cos(patch.rotation);
        const sin = Math.sin(patch.rotation);
        points.push(new Phaser.Geom.Point(patch.x + localX * cos - localY * sin, patch.y + localX * sin + localY * cos));
      }
      const color = biomeColors[patch.kind] ?? SOIL;
      this.terrain.fillStyle(color, 0.12 + snapshot.qualities.biosphere * 0.06);
      this.terrain.fillPoints(points, true);
      this.terrain.lineStyle(0.55, mixColor(color, BONE, 0.2), 0.06);
      this.terrain.strokePoints(points, true);

      if (patch.kind === 'canopy' || patch.kind === 'wetland') {
        const lifeCount = 2 + Math.floor(snapshot.qualities.biosphere * 5);
        for (let life = 0; life < lifeCount; life += 1) {
          const angle = hashUnit(patch.seed, 31 + life) * Math.PI * 2;
          const radius = Math.sqrt(hashUnit(patch.seed, 51 + life));
          const x = patch.x + Math.cos(angle) * patch.rx * radius * 0.78;
          const y = patch.y + Math.sin(angle) * patch.ry * radius * 0.72;
          if (patch.kind === 'canopy') this.drawStaticTree(x, y, 2.5 + hashUnit(patch.seed, 71 + life) * 4.5, GROWTH, patch.seed + life);
          else this.drawStaticReed(x, y, 3 + hashUnit(patch.seed, 91 + life) * 4, WATER);
        }
      } else if (patch.kind === 'cultivated') {
        this.terrain.lineStyle(0.6, SUN, 0.09);
        for (let row = -2; row <= 2; row += 1) {
          this.terrain.beginPath();
          this.terrain.moveTo(patch.x - patch.rx * 0.6, patch.y + row * 5);
          this.terrain.lineTo(patch.x + patch.rx * 0.6, patch.y + row * 5 + hashSigned(patch.seed, row + 103) * 3);
          this.terrain.strokePath();
        }
      } else if (patch.kind === 'scarland') {
        this.drawStaticCrack(patch.x, patch.y, patch.rx * 0.42, patch.seed, SCAR, 0.12);
      }
    }

    this.drawStaticRiver(layout.river, 10 + snapshot.qualities.biosphere * 8);
    for (const tributary of layout.tributaries) this.drawStaticRiver(tributary, 3.5 + snapshot.qualities.biosphere * 4);
    this.drawStaticMountain(layout, snapshot);

    for (let contour = 0; contour < 13; contour += 1) {
      const expansion = contour * 25;
      this.drawIrregularLoop(
        this.terrain,
        layout.center.x,
        layout.center.y,
        width * 0.16 + expansion,
        height * 0.11 + expansion * 0.52,
        snapshot.seed + contour * 73,
        3 + snapshot.knobs.novelty * 4,
        contour % 4 === 0 ? WATER : BONE,
        0.022,
        contour % 5 === 0 ? 1.1 : 0.5,
      );
    }
  }

  private drawStaticRiver(points: WorldPoint[], width: number): void {
    this.strokePolyline(this.terrain, points, DEEP_WATER, 0.58, width + 7);
    this.strokePolyline(this.terrain, points, WATER, 0.16, width);
    this.strokePolyline(this.terrain, points, BONE, 0.055, 0.7);
  }

  private drawStaticMountain(layout: VisualWorldLayout, snapshot: SimulationSnapshot): void {
    const { mountain } = layout;
    const scale = 0.78 + Math.min(0.75, snapshot.lessons.length * 0.035);
    for (let ridge = 5; ridge >= 0; ridge -= 1) {
      const width = (52 + ridge * 23) * scale;
      const height = (38 + ridge * 12) * scale;
      const alpha = 0.035 + (5 - ridge) * 0.014;
      this.terrain.fillStyle(ridge % 2 === 0 ? STONE : SOIL, alpha);
      this.terrain.beginPath();
      this.terrain.moveTo(mountain.x - width, mountain.y + height * 0.55);
      this.terrain.lineTo(mountain.x - width * 0.38, mountain.y - height * 0.22);
      this.terrain.lineTo(mountain.x - width * 0.12, mountain.y - height);
      this.terrain.lineTo(mountain.x + width * 0.18, mountain.y - height * 0.45);
      this.terrain.lineTo(mountain.x + width * 0.46, mountain.y - height * 0.72);
      this.terrain.lineTo(mountain.x + width, mountain.y + height * 0.55);
      this.terrain.closePath();
      this.terrain.fillPath();
      this.terrain.lineStyle(0.7, BONE, alpha + 0.025);
      this.terrain.strokePath();
    }
  }

  private drawStaticTree(x: number, y: number, size: number, color: number, seed: number): void {
    this.terrain.lineStyle(0.65, STONE, 0.17);
    this.terrain.beginPath();
    this.terrain.moveTo(x, y + size * 1.2);
    this.terrain.lineTo(x + hashSigned(seed, 1) * 0.8, y);
    this.terrain.strokePath();
    this.terrain.fillStyle(color, 0.11);
    this.terrain.fillCircle(x, y - size * 0.32, size);
    this.terrain.fillCircle(x - size * 0.72, y, size * 0.65);
    this.terrain.fillCircle(x + size * 0.68, y, size * 0.72);
  }

  private drawStaticReed(x: number, y: number, size: number, color: number): void {
    this.terrain.lineStyle(0.65, color, 0.16);
    for (let reed = -1; reed <= 1; reed += 1) {
      this.terrain.beginPath();
      this.terrain.moveTo(x + reed * 2, y + size);
      this.terrain.lineTo(x + reed * 2 + reed, y - size);
      this.terrain.strokePath();
    }
  }

  private drawStaticCrack(x: number, y: number, length: number, seed: number, color: number, alpha: number): void {
    this.terrain.lineStyle(1, color, alpha);
    this.terrain.beginPath();
    this.terrain.moveTo(x - length * 0.5, y - hashSigned(seed, 1) * 3);
    for (let segment = 1; segment <= 6; segment += 1) {
      this.terrain.lineTo(x - length * 0.5 + length * (segment / 6), y + hashSigned(seed, segment + 7) * length * 0.16);
    }
    this.terrain.strokePath();
  }

  private drawAmbientLife(snapshot: SimulationSnapshot, layout: VisualWorldLayout, time: number): void {
    const motionTime = this.reducedMotion ? 0 : time;
    for (const mote of this.dust) {
      const drift = Math.sin(motionTime * mote.speed + mote.phase) * (6 + snapshot.qualities.wonder * 8);
      const x = mote.x * layout.width + drift;
      const y = mote.y * layout.height + Math.cos(motionTime * mote.speed * 0.7 + mote.phase) * 5;
      const alpha = 0.025 + 0.05 * (0.5 + 0.5 * Math.sin(motionTime * 0.4 + mote.phase));
      this.world.fillStyle(mote.phase % 2 > 1 ? BONE : WATER, alpha);
      this.world.fillCircle(x, y, mote.size);
    }

    const biosphere = snapshot.qualities.biosphere;
    const flockCount = Math.floor(biosphere * 5);
    for (let flock = 0; flock < flockCount; flock += 1) {
      const x = ((motionTime * (5 + flock) + hashUnit(snapshot.seed, 3000 + flock) * layout.width * 1.3) % (layout.width * 1.3)) - layout.width * 0.15;
      const y = layout.height * (0.12 + hashUnit(snapshot.seed, 3050 + flock) * 0.5) + Math.sin(motionTime * 0.4 + flock) * 8;
      this.world.lineStyle(0.65, BONE, 0.16 + biosphere * 0.12);
      for (let bird = 0; bird < 3 + flock; bird += 1) {
        const bx = x - bird * 7;
        const by = y + Math.abs(bird - flock * 0.5) * 3;
        this.world.beginPath();
        this.world.moveTo(bx - 2.5, by);
        this.world.lineTo(bx, by - 1.5);
        this.world.lineTo(bx + 2.5, by);
        this.world.strokePath();
      }
    }

    if (snapshot.knobs.ecologicalPressure > 0.62) {
      const gritCount = Math.floor(snapshot.knobs.ecologicalPressure * 20);
      for (let grit = 0; grit < gritCount; grit += 1) {
        const x = (hashUnit(snapshot.seed, grit + 3100) * layout.width + motionTime * (8 + grit % 5)) % layout.width;
        const y = hashUnit(snapshot.seed, grit + 3200) * layout.height;
        this.world.fillStyle(SCAR, 0.035 + snapshot.knobs.ecologicalPressure * 0.035);
        this.world.fillRect(x, y, 4 + grit % 7, 0.6);
      }
    }
  }

  private drawRegions(snapshot: SimulationSnapshot, layout: VisualWorldLayout, time: number): void {
    for (const region of layout.regions) {
      const color = terrainColor(region.terrain, region.vitality);
      const pulse = this.reducedMotion ? 0 : Math.sin(time * 0.28 + region.seed) * 2;
      this.world.fillStyle(color, 0.025 + region.vitality * 0.045);
      this.world.fillEllipse(region.x, region.y, (region.radius + pulse) * 2.1, (region.radius + pulse) * 1.45);
      this.drawIrregularLoop(this.world, region.x, region.y, region.radius + pulse, region.radius * 0.68 + pulse, region.seed, 4 + (1 - region.openness) * 5, color, 0.1 + region.openness * 0.11, 0.7 + region.vitality);
      if (region.vitality > 0.62) this.drawRegionGrowth(region, snapshot, time, color);
      this.registerTarget('region', region.id, region, region.radius, 0.68, layout);
    }
  }

  private drawRegionGrowth(region: AgencyRegionSite, snapshot: SimulationSnapshot, time: number, color: number): void {
    const count = 3 + Math.floor(region.vitality * 7);
    for (let index = 0; index < count; index += 1) {
      const angle = hashUnit(region.seed, 3300 + index) * Math.PI * 2;
      const distance = hashUnit(region.seed, 3350 + index) * region.radius * 0.8;
      const sway = this.reducedMotion ? 0 : Math.sin(time * 0.7 + index) * 1.4;
      const x = region.x + Math.cos(angle) * distance;
      const y = region.y + Math.sin(angle) * distance * 0.65;
      this.world.lineStyle(0.6, color, 0.18 + snapshot.qualities.biosphere * 0.15);
      this.world.beginPath();
      this.world.moveTo(x, y + 3);
      this.world.lineTo(x + sway, y - 3);
      this.world.strokePath();
      this.world.fillStyle(color, 0.14);
      this.world.fillCircle(x + sway, y - 3, 1.4);
    }
  }

  private drawWater(snapshot: SimulationSnapshot, layout: VisualWorldLayout, time: number): void {
    const flow = this.reducedMotion ? 0 : time * (0.015 + snapshot.qualities.biosphere * 0.025);
    const paths = [layout.river, ...layout.tributaries];
    paths.forEach((path, pathIndex) => {
      const count = pathIndex === 0 ? 14 : 5;
      for (let ripple = 0; ripple < count; ripple += 1) {
        const t = (flow + ripple / count + pathIndex * 0.17) % 1;
        const point = polylinePoint(path, t);
        this.light.fillStyle(WATER, 0.08 + snapshot.qualities.biosphere * 0.12);
        this.light.fillEllipse(point.x, point.y, pathIndex === 0 ? 5 : 3, 1.5);
      }
    });
  }

  private drawPressureFronts(pressures: PressureSite[], time: number): void {
    for (const pressure of pressures) {
      const color = pressureColor(pressure.kind, pressure.focus);
      const advance = this.reducedMotion ? 0 : Math.sin(time * (0.45 + pressure.momentum * 0.7) + pressure.seed) * pressure.radius * 0.06;
      for (let ring = 3; ring >= 0; ring -= 1) {
        const radius = pressure.radius * (0.52 + ring * 0.17) + advance;
        this.drawIrregularLoop(this.world, pressure.x, pressure.y, radius, radius * 0.66, pressure.seed + ring * 19, 5 + pressure.severity * 9, color, 0.04 + pressure.severity * 0.055, 0.8 + pressure.severity);
      }
      const symbols = 3 + Math.floor(pressure.severity * 7);
      for (let symbol = 0; symbol < symbols; symbol += 1) {
        const angle = hashUnit(pressure.seed, 3400 + symbol) * Math.PI * 2 + time * (this.reducedMotion ? 0 : pressure.momentum * 0.025);
        const radius = pressure.radius * (0.45 + hashUnit(pressure.seed, 3450 + symbol) * 0.45);
        const x = pressure.x + Math.cos(angle) * radius;
        const y = pressure.y + Math.sin(angle) * radius * 0.68;
        this.world.fillStyle(color, 0.16 + pressure.severity * 0.2);
        pressure.kind.includes('ecolog') || pressure.kind.includes('weather')
          ? this.world.fillTriangle(x, y - 3, x - 2, y + 2, x + 2, y + 2)
          : this.world.fillCircle(x, y, 1 + pressure.severity * 1.5);
      }
      if (this.layout) this.registerTarget('pressure', pressure.id, pressure, pressure.radius, 0.68, this.layout);
    }
  }

  private drawRoutes(snapshot: SimulationSnapshot, layout: VisualWorldLayout, time: number): void {
    for (let index = 0; index < layout.routes.length; index += 1) {
      const route = layout.routes[index] as RouteSite;
      const colorA = VOICE_BY_ID[route.a].color;
      const colorB = VOICE_BY_ID[route.b].color;
      const baseAlpha = 0.07 + route.strength * 0.18;
      this.strokeQuadratic(this.world, route.start, route.control, route.end, SOIL, baseAlpha + 0.12, 3 + route.strength * 4, 0);
      this.strokeQuadratic(this.world, route.start, route.control, route.end, colorA, baseAlpha, 0.7 + route.strength * 1.2, -1.1);
      this.strokeQuadratic(this.world, route.start, route.control, route.end, colorB, baseAlpha, 0.7 + route.strength * 1.2, 1.1);

      if (route.tension > 0.54) {
        const fractures = 2 + Math.floor(route.tension * 4);
        for (let fracture = 0; fracture < fractures; fracture += 1) {
          const point = quadraticPoint(route.start, route.control, route.end, (fracture + 1) / (fractures + 1));
          this.world.lineStyle(0.8, SCAR, 0.18 + route.tension * 0.16);
          this.world.beginPath();
          this.world.moveTo(point.x - 2, point.y - 3);
          this.world.lineTo(point.x + 1, point.y);
          this.world.lineTo(point.x - 1, point.y + 4);
          this.world.strokePath();
        }
      }

      const travelers = Math.min(6, 1 + Math.floor(route.exchanges / 2) + Math.floor(route.strength * 2));
      for (let traveler = 0; traveler < travelers; traveler += 1) {
        const direction = traveler % 2 === 0 ? 1 : -1;
        const raw = ((this.reducedMotion ? 0.33 : time * (0.014 + route.strength * 0.025)) + traveler / travelers + index * 0.137) % 1;
        const t = direction > 0 ? raw : 1 - raw;
        const point = quadraticPoint(route.start, route.control, route.end, t);
        const tangent = quadraticTangent(route.start, route.control, route.end, t);
        this.drawPerson(point.x, point.y, traveler % 2 === 0 ? colorA : colorB, 0.62 + route.strength * 0.25, tangent, time + traveler);
        if (route.exchanges > 2 && traveler % 3 === 0) {
          this.world.fillStyle(SUN, 0.3);
          this.world.fillRect(point.x - 1.5, point.y - 7, 3, 2.5);
        }
      }
      const routePoint = quadraticPoint(route.start, route.control, route.end, 0.5);
      this.registerTarget('relationship', route.a, routePoint, 10 + route.strength * 10, 1, layout, route.b);
    }
  }

  private drawCommons(snapshot: SimulationSnapshot, layout: VisualWorldLayout, time: number): void {
    const { center } = layout;
    const scale = 1 + Math.min(1.4, (snapshot.works.length + snapshot.laws.length * 2 + snapshot.epoch * 3) / 45);
    const breath = this.reducedMotion ? 0 : Math.sin(time * 0.7) * 1.5;
    this.world.fillStyle(SOIL, 0.56);
    this.world.fillEllipse(center.x, center.y, 70 * scale, 42 * scale);
    for (let ring = 0; ring < 4 + Math.min(3, snapshot.epoch); ring += 1) {
      this.world.lineStyle(ring === 0 ? 1.2 : 0.65, ring % 2 === 0 ? BONE : WATER, 0.09 + ring * 0.015);
      this.world.strokeEllipse(center.x, center.y, 28 * scale + ring * 12 + breath, 15 * scale + ring * 7 + breath * 0.5);
    }

    const councilSize = snapshot.civicPhase === 'council' || snapshot.civicPhase === 'decision' ? 7 : 3 + Math.min(5, snapshot.epoch);
    for (let person = 0; person < councilSize; person += 1) {
      const angle = (person / councilSize) * Math.PI * 2 + (this.reducedMotion ? 0 : time * 0.012);
      const x = center.x + Math.cos(angle) * 21 * scale;
      const y = center.y + Math.sin(angle) * 11 * scale;
      const voice = snapshot.voices[person % snapshot.voices.length];
      this.drawPerson(x, y, voice ? VOICE_BY_ID[voice.id].color : BONE, 0.75, { x: center.x - x, y: center.y - y }, time + person);
    }

    for (const law of layout.laws) {
      const focusColor = hexColor(QUALITY_META[law.law.strongest].color);
      this.world.fillStyle(STONE, 0.72);
      this.world.fillRoundedRect(law.x - law.radius * 0.55, law.y - law.radius, law.radius * 1.1, law.radius * 2, 1.4);
      this.world.lineStyle(0.7, focusColor, 0.46);
      this.world.strokeRoundedRect(law.x - law.radius * 0.55, law.y - law.radius, law.radius * 1.1, law.radius * 2, 1.4);
      this.world.beginPath();
      this.world.moveTo(law.x - law.radius * 0.27, law.y - law.radius * 0.35);
      this.world.lineTo(law.x + law.radius * 0.27, law.y - law.radius * 0.35);
      this.world.moveTo(law.x - law.radius * 0.2, law.y + law.radius * 0.1);
      this.world.lineTo(law.x + law.radius * 0.2, law.y + law.radius * 0.1);
      this.world.strokePath();
    }
    this.registerTarget('commons', 'commons', center, 28 * scale, 0.62, layout);
  }

  private drawCivicWorks(snapshot: SimulationSnapshot, layout: VisualWorldLayout, time: number): void {
    for (let index = 0; index < layout.works.length; index += 1) {
      const site = layout.works[index] as WorkSite;
      for (const participant of site.work.participants.slice(0, 3)) {
        const settlement = layout.settlementByVoice.get(participant);
        if (!settlement) continue;
        this.world.lineStyle(0.6, this.workColor(site.work, 0), 0.025 + site.work.resonance * 0.055);
        this.world.beginPath();
        this.world.moveTo(site.x, site.y);
        this.world.lineTo(settlement.x, settlement.y);
        this.world.strokePath();
      }
      this.drawWorkStructure(site, time);

      if (site.construction < 0.99) {
        this.drawConstruction(site, time);
      }
      if (index === layout.works.length - 1 && (snapshot.civicPhase === 'growth' || snapshot.civicPhase === 'action')) {
        const pulse = this.reducedMotion ? 0 : Math.sin(time * 2.4) * 3;
        this.world.lineStyle(1.1, SUN, 0.38);
        this.world.strokeEllipse(site.x, site.y, site.radius * 3 + pulse, site.radius * 1.8 + pulse * 0.5);
        this.light.fillStyle(SUN, 0.045);
        this.light.fillCircle(site.x, site.y, site.radius * 3.3);
      }
      this.registerTarget('work', site.work.id, site, Math.max(9, site.radius * 1.25), 0.75, layout);
    }
  }

  private drawWorkStructure(site: WorkSite, time: number): void {
    const work = site.work;
    const color = this.workColor(work, 0);
    const secondary = this.workColor(work, 1);
    const progress = easeOutCubic(clamp(site.construction, 0.08, 1));
    const size = site.radius * (0.65 + progress * 0.35);
    const top = site.y - size * progress;
    const contested = work.status === 'contested';
    this.light.fillStyle(contested ? SCAR : color, 0.025 + work.resonance * 0.025);
    this.light.fillCircle(site.x, site.y, size * 2.2);
    this.world.lineStyle(0.8 + work.maturity, contested ? SCAR : color, 0.4 + work.maturity * 0.34);

    switch (work.kind) {
      case 'shared-word':
        this.world.fillStyle(STONE, 0.78);
        this.world.fillRoundedRect(site.x - size * 0.48, top, size * 0.96, size * 1.5, size * 0.12);
        this.world.lineStyle(0.7, secondary, 0.7);
        for (let line = 0; line < 3; line += 1) {
          this.world.beginPath();
          this.world.moveTo(site.x - size * 0.28, top + size * (0.38 + line * 0.29));
          this.world.lineTo(site.x + size * (line === 1 ? 0.17 : 0.28), top + size * (0.38 + line * 0.29));
          this.world.strokePath();
        }
        break;
      case 'listening-ritual':
      case 'witness-circle':
        for (let arc = 0; arc < 4; arc += 1) {
          this.world.strokeEllipse(site.x, site.y, size * (0.7 + arc * 0.28), size * (0.34 + arc * 0.16));
        }
        this.world.fillStyle(BONE, 0.55);
        for (let seat = 0; seat < 7; seat += 1) {
          const angle = seat / 7 * Math.PI * 2;
          this.world.fillCircle(site.x + Math.cos(angle) * size, site.y + Math.sin(angle) * size * 0.52, 1.2);
        }
        break;
      case 'consent-protocol':
        this.world.beginPath();
        this.world.moveTo(site.x - size, site.y + size * 0.65);
        this.world.lineTo(site.x - size, top);
        this.world.lineTo(site.x, top - size * 0.5);
        this.world.lineTo(site.x + size, top);
        this.world.lineTo(site.x + size, site.y + size * 0.65);
        this.world.strokePath();
        this.world.lineStyle(0.7, BONE, 0.38);
        this.world.beginPath();
        this.world.moveTo(site.x, top - size * 0.5);
        this.world.lineTo(site.x, site.y + size * 0.8);
        this.world.strokePath();
        break;
      case 'memory-practice':
        for (let layer = 0; layer < 3; layer += 1) {
          this.world.strokeRoundedRect(site.x - size * (0.75 - layer * 0.12), top + layer * size * 0.24, size * (1.5 - layer * 0.24), size * 1.15, 2);
        }
        this.world.fillStyle(secondary, 0.36);
        this.world.fillCircle(site.x, site.y - size * 0.15, size * 0.17);
        break;
      case 'ecological-covenant':
        this.world.beginPath();
        this.world.moveTo(site.x, site.y + size);
        this.world.lineTo(site.x, top - size * 0.5);
        this.world.strokePath();
        for (let branch = 0; branch < 6; branch += 1) {
          const angle = branch / 6 * Math.PI * 2 + (this.reducedMotion ? 0 : time * 0.01);
          this.world.beginPath();
          this.world.moveTo(site.x, top + size * 0.15);
          this.world.lineTo(site.x + Math.cos(angle) * size, top + size * 0.15 + Math.sin(angle) * size * 0.62);
          this.world.strokePath();
          this.world.fillStyle(secondary, 0.32);
          this.world.fillCircle(site.x + Math.cos(angle) * size, top + size * 0.15 + Math.sin(angle) * size * 0.62, size * 0.18);
        }
        break;
      case 'open-question':
        this.world.strokeCircle(site.x, top, size * 0.68);
        this.world.beginPath();
        this.world.moveTo(site.x, top + size * 0.68);
        this.world.lineTo(site.x, site.y + size * 0.8);
        this.world.moveTo(site.x, top);
        this.world.lineTo(site.x + Math.cos(time * (this.reducedMotion ? 0 : 0.14)) * size * 0.6, top + Math.sin(time * (this.reducedMotion ? 0 : 0.14)) * size * 0.4);
        this.world.strokePath();
        break;
      case 'translation-braid':
        for (let strand = -1; strand <= 1; strand += 2) {
          this.world.beginPath();
          for (let step = 0; step <= 14; step += 1) {
            const t = step / 14;
            const x = site.x - size + t * size * 2;
            const y = site.y + Math.sin(t * Math.PI * 3 + strand) * size * 0.35 * strand - size * 0.2;
            if (step === 0) this.world.moveTo(x, y);
            else this.world.lineTo(x, y);
          }
          this.world.strokePath();
        }
        this.world.fillStyle(STONE, 0.42);
        this.world.fillRect(site.x - size, site.y + size * 0.35, size * 2, size * 0.26);
        break;
    }
    this.world.fillStyle(contested ? SCAR : BONE, 0.52);
    this.world.fillCircle(site.x, site.y, 1.2 + work.maturity * 1.4);
  }

  private drawConstruction(site: WorkSite, time: number): void {
    const height = site.radius * 2.6;
    const width = site.radius * 2.2;
    this.world.lineStyle(0.7, BONE, 0.26);
    for (let pole = -1; pole <= 1; pole += 1) {
      const x = site.x + pole * width * 0.5;
      this.world.beginPath();
      this.world.moveTo(x, site.y + site.radius);
      this.world.lineTo(x, site.y - height);
      this.world.strokePath();
    }
    for (let level = 0; level < 4; level += 1) {
      const y = site.y + site.radius - level * height / 3;
      this.world.beginPath();
      this.world.moveTo(site.x - width * 0.62, y);
      this.world.lineTo(site.x + width * 0.62, y);
      this.world.strokePath();
    }
    const workers = 3;
    for (let worker = 0; worker < workers; worker += 1) {
      const angle = worker / workers * Math.PI * 2 + time * (this.reducedMotion ? 0 : 0.2);
      const x = site.x + Math.cos(angle) * site.radius * 1.5;
      const y = site.y + Math.sin(angle) * site.radius * 0.75;
      this.drawPerson(x, y, worker % 2 ? SUN : BONE, 0.68, { x: site.x - x, y: site.y - y }, time + worker);
    }
    const sparks = this.reducedMotion ? 2 : 5;
    for (let spark = 0; spark < sparks; spark += 1) {
      const age = (time * 1.7 + spark * 0.21) % 1;
      this.light.fillStyle(SUN, (1 - age) * 0.45);
      this.light.fillCircle(site.x + hashSigned(site.seed, spark) * age * 16, site.y - height * site.construction + age * 9, 1.1);
    }
  }

  private drawAgencyArtifacts(artifacts: AgencyArtifactSite[], time: number): void {
    for (const artifact of artifacts) {
      const domainColor = artifact.domain === 'law' ? BONE
        : artifact.domain === 'culture' ? 0xcf91b7
          : artifact.domain === 'invention' ? 0x83c8d6
            : artifact.domain === 'habitat' ? GROWTH
              : SUN;
      const size = 4 + artifact.maturity * 8;
      const riskPulse = artifact.risk > 0.5 && !this.reducedMotion ? Math.sin(time * 2 + artifact.seed) * 1.5 : 0;
      this.light.fillStyle(artifact.risk > 0.65 ? SCAR : domainColor, 0.022 + artifact.maturity * 0.035);
      this.light.fillCircle(artifact.x, artifact.y, size * 2.2 + riskPulse);
      this.world.lineStyle(0.75, artifact.risk > 0.65 ? SCAR : domainColor, 0.28 + artifact.maturity * 0.4);
      if (artifact.domain === 'invention') {
        const teeth = 7;
        const points: Phaser.Geom.Point[] = [];
        for (let tooth = 0; tooth < teeth * 2; tooth += 1) {
          const angle = tooth / (teeth * 2) * Math.PI * 2 + time * (this.reducedMotion ? 0 : 0.025);
          const radius = size * (tooth % 2 === 0 ? 1 : 0.72);
          points.push(new Phaser.Geom.Point(artifact.x + Math.cos(angle) * radius, artifact.y + Math.sin(angle) * radius));
        }
        this.world.strokePoints(points, true);
        this.world.strokeCircle(artifact.x, artifact.y, size * 0.32);
      } else if (artifact.domain === 'culture') {
        this.world.beginPath();
        this.world.moveTo(artifact.x, artifact.y + size);
        this.world.lineTo(artifact.x, artifact.y - size);
        this.world.lineTo(artifact.x + size, artifact.y - size * 0.55);
        this.world.lineTo(artifact.x, artifact.y - size * 0.1);
        this.world.strokePath();
      } else if (artifact.domain === 'law') {
        this.world.strokeRoundedRect(artifact.x - size * 0.55, artifact.y - size, size * 1.1, size * 2, 2);
        this.world.beginPath();
        this.world.moveTo(artifact.x - size * 0.25, artifact.y - size * 0.35);
        this.world.lineTo(artifact.x + size * 0.25, artifact.y - size * 0.35);
        this.world.strokePath();
      } else {
        this.world.strokeEllipse(artifact.x, artifact.y, size * 2, size * 1.15);
        this.world.beginPath();
        this.world.moveTo(artifact.x - size, artifact.y);
        this.world.lineTo(artifact.x, artifact.y - size);
        this.world.lineTo(artifact.x + size, artifact.y);
        this.world.strokePath();
      }
      if (artifact.risk > 0.68) {
        this.world.lineStyle(0.6, SCAR, 0.35);
        this.world.strokeCircle(artifact.x, artifact.y, size * 1.35 + riskPulse);
      }
      if (this.layout) this.registerTarget(artifact.domain === 'habitat' ? 'settlement' : artifact.domain, artifact.id, artifact, Math.max(9, size * 1.4), 0.8, this.layout);
    }
  }

  private drawSettlements(snapshot: SimulationSnapshot, layout: VisualWorldLayout, time: number): void {
    const mobile = layout.width < 720;
    for (const site of layout.settlements) {
      const definition = VOICE_BY_ID[site.voiceId];
      const state = snapshot.voices.find((voice) => voice.id === site.voiceId);
      const selected = this.selectedVoices.includes(site.voiceId);
      const hovered = this.hoveredVoice === site.voiceId;
      const glow = selected ? 0.1 : hovered ? 0.06 : 0.025;
      const boundaryRadius = site.radius * (0.82 + site.tier * 0.035);
      this.light.fillStyle(definition.color, glow + (state?.presence ?? 0.5) * 0.018);
      this.light.fillEllipse(site.x, site.y, boundaryRadius * 2.7, boundaryRadius * 1.75);
      this.world.fillStyle(mixColor(SOIL, definition.color, 0.14), 0.22 + site.ecology * 0.04);
      this.world.fillEllipse(site.x, site.y, boundaryRadius * 2.12, boundaryRadius * 1.25);
      this.drawIrregularLoop(this.world, site.x, site.y, boundaryRadius, boundaryRadius * 0.58, site.seed, 4 + site.culture * 5, selected ? BONE : definition.color, selected ? 0.66 : 0.16 + site.culture * 0.1, selected ? 1.6 : 0.8);

      const buildings = Math.min(mobile ? 9 : 15, 3 + site.tier * 2 + Math.floor(site.population / 35));
      for (let building = 0; building < buildings; building += 1) {
        const angle = hashUnit(site.seed, 3600 + building) * Math.PI * 2;
        const distance = Math.sqrt(hashUnit(site.seed, 3700 + building)) * boundaryRadius * 0.72;
        const x = site.x + Math.cos(angle) * distance;
        const y = site.y + Math.sin(angle) * distance * 0.48;
        const size = 3.4 + hashUnit(site.seed, 3800 + building) * (3 + site.tier * 0.7);
        this.drawHabitat(site, x, y, size, building, time);
      }

      const inhabitants = Math.min(mobile ? 7 : 13, 3 + Math.floor(site.population / 18));
      for (let inhabitant = 0; inhabitant < inhabitants; inhabitant += 1) {
        const phase = time * (this.reducedMotion ? 0 : 0.05 + (inhabitant % 3) * 0.012) + hashUnit(site.seed, 3900 + inhabitant) * Math.PI * 2;
        const orbit = boundaryRadius * (0.3 + hashUnit(site.seed, 3950 + inhabitant) * 0.55);
        const x = site.x + Math.cos(phase) * orbit;
        const y = site.y + Math.sin(phase) * orbit * 0.46;
        this.drawPerson(x, y, inhabitant % 4 === 0 ? BONE : definition.color, 0.52 + site.tier * 0.025, { x: -Math.sin(phase), y: Math.cos(phase) * 0.46 }, time + inhabitant);
      }

      if (site.ecology > 0.58) {
        for (let plant = 0; plant < 4 + Math.floor(site.ecology * 5); plant += 1) {
          const angle = hashUnit(site.seed, 4000 + plant) * Math.PI * 2;
          const radius = boundaryRadius * (0.72 + hashUnit(site.seed, 4050 + plant) * 0.35);
          const x = site.x + Math.cos(angle) * radius;
          const y = site.y + Math.sin(angle) * radius * 0.58;
          this.drawPlant(x, y, 2 + site.ecology * 3, definition.color, time + plant);
        }
      }

      this.voicePositions.set(site.voiceId, { x: site.x, y: site.y, radius: boundaryRadius });
    }
  }

  private drawHabitat(site: SettlementSite, x: number, y: number, size: number, index: number, time: number): void {
    const color = VOICE_BY_ID[site.voiceId].color;
    this.world.lineStyle(0.7 + site.tier * 0.06, color, 0.36 + site.tier * 0.04);
    this.world.fillStyle(mixColor(SOIL, color, 0.18), 0.72);
    switch (site.voiceId) {
      case 'pioneers':
        this.world.fillTriangle(x - size, y + size * 0.65, x, y - size * (1.1 + site.tier * 0.08), x + size, y + size * 0.65);
        this.world.strokeTriangle(x - size, y + size * 0.65, x, y - size * (1.1 + site.tier * 0.08), x + size, y + size * 0.65);
        this.world.lineStyle(0.6, BONE, 0.35);
        this.world.beginPath();
        this.world.moveTo(x, y - size);
        this.world.lineTo(x, y + size * 0.55);
        this.world.strokePath();
        break;
      case 'innovators':
        this.world.fillRoundedRect(x - size, y - size * 0.7, size * 2, size * 1.4, 1.5);
        this.world.strokeRoundedRect(x - size, y - size * 0.7, size * 2, size * 1.4, 1.5);
        this.world.strokeCircle(x, y, size * 0.36);
        if (index % 2 === 0) {
          this.world.beginPath();
          this.world.moveTo(x + size * 0.48, y - size * 0.7);
          this.world.lineTo(x + size * 0.48, y - size * 1.5);
          this.world.strokePath();
          this.light.fillStyle(color, 0.13);
          this.light.fillCircle(x + size * 0.48 + Math.sin(time * 0.5 + index), y - size * 1.7, 1.8);
        }
        break;
      case 'cultivators':
        this.world.fillEllipse(x, y, size * 2, size * 1.25);
        this.world.strokeEllipse(x, y, size * 2, size * 1.25);
        for (let row = -1; row <= 1; row += 1) {
          this.world.beginPath();
          this.world.moveTo(x - size * 0.7, y + row * size * 0.25);
          this.world.lineTo(x + size * 0.7, y + row * size * 0.25);
          this.world.strokePath();
        }
        break;
      case 'harbingers':
        this.world.fillTriangle(x - size, y + size * 0.6, x, y - size, x + size, y + size * 0.6);
        this.world.strokeTriangle(x - size, y + size * 0.6, x, y - size, x + size, y + size * 0.6);
        this.world.strokeCircle(x, y - size * 0.25, size * 0.28);
        break;
      case 'guardians':
        this.world.fillRect(x - size, y - size * 0.55, size * 0.7, size * 1.1);
        this.world.fillRect(x + size * 0.3, y - size * 0.55, size * 0.7, size * 1.1);
        this.world.strokeRect(x - size, y - size * 0.55, size * 0.7, size * 1.1);
        this.world.strokeRect(x + size * 0.3, y - size * 0.55, size * 0.7, size * 1.1);
        this.world.beginPath();
        this.world.moveTo(x - size * 0.3, y - size * 0.55);
        this.world.lineTo(x, y - size * 0.95);
        this.world.lineTo(x + size * 0.3, y - size * 0.55);
        this.world.strokePath();
        break;
      case 'ecostewards':
        this.world.beginPath();
        this.world.moveTo(x, y + size);
        this.world.lineTo(x, y - size * 0.55);
        this.world.strokePath();
        this.world.fillStyle(color, 0.22 + site.ecology * 0.12);
        this.world.fillCircle(x, y - size * 0.65, size * 0.8);
        this.world.fillCircle(x - size * 0.55, y - size * 0.35, size * 0.55);
        this.world.fillCircle(x + size * 0.55, y - size * 0.35, size * 0.55);
        this.world.lineStyle(0.6, BONE, 0.25);
        this.world.strokeEllipse(x, y + size * 0.2, size * 1.4, size * 0.55);
        break;
      case 'mountaineers':
        for (let terrace = 0; terrace < 3; terrace += 1) {
          this.world.fillRect(x - size + terrace * size * 0.22, y - size * 0.9 + terrace * size * 0.52, size * (2 - terrace * 0.44), size * 0.42);
          this.world.strokeRect(x - size + terrace * size * 0.22, y - size * 0.9 + terrace * size * 0.52, size * (2 - terrace * 0.44), size * 0.42);
        }
        break;
    }
  }

  private drawArrivals(arrivals: ArrivalSite[], time: number): void {
    for (const arrival of arrivals) {
      const control = {
        x: (arrival.origin.x + arrival.destination.x) / 2 + hashSigned(arrival.seed, 4100) * 70,
        y: (arrival.origin.y + arrival.destination.y) / 2 + hashSigned(arrival.seed, 4150) * 48,
      };
      this.strokeQuadratic(this.world, arrival.origin, control, arrival.destination, SUN, 0.12, 1.1, 0);
      const pulse = this.reducedMotion ? arrival.progress : (arrival.progress + (time * 0.018) % 0.16) % 1;
      const point = quadraticPoint(arrival.origin, control, arrival.destination, pulse);
      const tangent = quadraticTangent(arrival.origin, control, arrival.destination, pulse);
      const members = 2 + Math.min(4, arrival.gifts.length + arrival.needs.length);
      for (let member = 0; member < members; member += 1) {
        this.drawPerson(point.x - tangent.y * member * 1.5, point.y + tangent.x * member * 1.5, member % 2 ? SUN : BONE, 0.7, tangent, time + member);
      }
      this.world.fillStyle(WATER, 0.34);
      this.world.fillRect(point.x - 2, point.y - 8, 4, 2.5);
      if (this.layout) this.registerTarget('arrival', arrival.id, point, 12, 1, this.layout);
    }
  }

  private drawScars(snapshot: SimulationSnapshot, layout: VisualWorldLayout, time: number): void {
    const lessons = snapshot.lessons.slice(-36);
    lessons.forEach((lesson, index) => {
      const participants = lesson.participants.map((voice) => layout.settlementByVoice.get(voice)).filter((site): site is SettlementSite => Boolean(site));
      const anchor = participants.length > 0
        ? { x: (participants[0]?.x ?? layout.mountain.x) * 0.6 + layout.mountain.x * 0.4, y: (participants[0]?.y ?? layout.mountain.y) * 0.6 + layout.mountain.y * 0.4 }
        : layout.mountain;
      const angle = hashUnit(lesson.glyphSeed, 4200 + index) * Math.PI * 2;
      const distance = 18 + (index % 8) * 9 + Math.floor(index / 8) * 6;
      const x = anchor.x + Math.cos(angle) * distance;
      const y = anchor.y + Math.sin(angle) * distance * 0.66;
      const size = 6 + Math.min(12, lesson.depth * 2.5);
      const selected = this.selectedLessonId === lesson.id;
      const color = lesson.resolved ? GROWTH : SCAR;
      this.world.lineStyle(selected ? 2 : 0.9 + lesson.depth * 0.2, selected ? BONE : color, selected ? 0.9 : 0.32 + lesson.depth * 0.08);
      this.world.beginPath();
      this.world.moveTo(x - size, y - size * 0.32);
      this.world.lineTo(x - size * 0.38, y - size * 0.06);
      this.world.lineTo(x - size * 0.09, y + size * 0.56);
      this.world.lineTo(x + size * 0.35, y - size * 0.27);
      this.world.lineTo(x + size, y + size * 0.42);
      this.world.strokePath();
      if (lesson.resolved) {
        for (let sprout = 0; sprout < 3; sprout += 1) {
          this.drawPlant(x - size * 0.45 + sprout * size * 0.45, y - size * 0.1, 2.5 + lesson.depth * 0.6, GROWTH, time + sprout);
        }
      } else {
        this.light.fillStyle(SCAR, 0.028 + lesson.depth * 0.012);
        this.light.fillCircle(x, y, size * 1.5);
      }
      this.lessonPositions.set(lesson.id, { x, y, radius: Math.max(10, size * 1.15) });
    });
  }

  private drawCulture(snapshot: SimulationSnapshot, layout: VisualWorldLayout, time: number): void {
    for (let index = 0; index < layout.culture.length; index += 1) {
      const site = layout.culture[index];
      if (!site) continue;
      const color = hexColor(QUALITY_META[site.word.quality].color);
      const sway = this.reducedMotion ? 0 : Math.sin(time * 0.45 + site.word.glyphSeed) * 1.2;
      this.world.lineStyle(0.55, color, 0.18 + site.word.strength * 0.2);
      this.world.beginPath();
      this.world.moveTo(site.x, site.y + site.radius * 1.8);
      this.world.lineTo(site.x + sway, site.y - site.radius * 1.5);
      this.world.lineTo(site.x + site.radius * 1.8 + sway, site.y - site.radius * 0.65);
      this.world.lineTo(site.x + sway, site.y);
      this.world.strokePath();
      if (index % 3 === 0) {
        this.world.fillStyle(color, 0.18);
        this.world.fillCircle(site.x + sway, site.y - site.radius * 1.5, 1.1 + site.word.strength);
      }
    }

    // Future culture motifs enter the world as distinct woven marks instead of
    // becoming another text list in the HUD.
    layout.futureMotifs.slice(0, 12).forEach((motif, index) => {
      const seed = stringSeed(motif);
      const angle = hashUnit(seed, 4300 + index) * Math.PI * 2;
      const radius = 52 + index * 7;
      const x = layout.center.x + Math.cos(angle) * radius;
      const y = layout.center.y + Math.sin(angle) * radius * 0.62;
      this.world.lineStyle(0.65, index % 2 ? WATER : SUN, 0.25);
      this.world.strokeEllipse(x, y, 7 + seed % 7, 4 + seed % 4);
      this.world.beginPath();
      this.world.moveTo(x - 5, y);
      this.world.lineTo(x + 5, y);
      this.world.moveTo(x, y - 4);
      this.world.lineTo(x, y + 4);
      this.world.strokePath();
    });
  }

  private drawActionPulse(snapshot: SimulationSnapshot, layout: VisualWorldLayout, time: number): void {
    const pulse = layout.lastAction;
    if (!pulse) return;
    const color = hexColor(pulse.color);
    const age = snapshot.civicPhase === 'action' || snapshot.civicPhase === 'growth'
      ? 0.25 + ((this.reducedMotion ? 0.45 : time * 0.18) % 0.75)
      : 0.82;
    const control = {
      x: (pulse.origin.x + pulse.destination.x) / 2 + hashSigned(pulse.seed, 4401) * 80,
      y: (pulse.origin.y + pulse.destination.y) / 2 + hashSigned(pulse.seed, 4402) * 60,
    };
    this.strokeQuadratic(this.light, pulse.origin, control, pulse.destination, color, 0.12 + pulse.magnitude * 0.18, 3 + pulse.magnitude * 5, 0);
    for (let mote = 0; mote < 13; mote += 1) {
      const t = clamp(age - mote * 0.035, 0, 1);
      const point = quadraticPoint(pulse.origin, control, pulse.destination, t);
      this.light.fillStyle(color, (1 - Math.abs(age - t)) * 0.28);
      this.light.fillCircle(point.x, point.y, 1 + (mote % 3) * 0.65);
    }
    const destinationRing = 12 + pulse.magnitude * 26 + Math.sin(time * (this.reducedMotion ? 0 : 1.8)) * 2;
    this.world.lineStyle(1.2, color, 0.36);
    this.world.strokeEllipse(pulse.destination.x, pulse.destination.y, destinationRing * 2, destinationRing);
  }

  private drawCivicTargetSelection(time: number): void {
    const selected = this.selectedCivicTarget;
    if (!selected) return;
    const hit = this.civicTargetHits.find((candidate) => candidate.target.kind === selected.kind
      && candidate.target.id === selected.id
      && candidate.target.secondaryId === selected.secondaryId);
    if (!hit) return;
    const pulse = this.reducedMotion ? 0 : Math.sin(time * 2.1) * 2.5;
    this.world.lineStyle(1.5, BONE, 0.84);
    this.world.strokeEllipse(hit.x, hit.y, (hit.radius + pulse) * 2.25, (hit.radius * hit.scaleY + pulse * 0.5) * 2.25);
    this.light.fillStyle(SUN, 0.035);
    this.light.fillCircle(hit.x, hit.y, hit.radius * 1.7);
  }

  private drawOutcomeFx(time: number, layout: VisualWorldLayout): void {
    const fx = this.outcomeFx;
    if (!fx) return;
    const age = time - fx.startedAt;
    if (age < 0 || age > 4.2) {
      this.outcomeFx = null;
      return;
    }
    const progress = clamp(age / 2.8, 0, 1);
    const fade = 1 - clamp((age - 2.5) / 1.7, 0, 1);
    const targetWork = layout.works.find((site) => site.work.id === fx.outcome.workId) ?? layout.works.at(-1);
    const target = targetWork ?? layout.center;
    fx.outcome.voices.forEach((voiceId, voiceIndex) => {
      const start = layout.settlementByVoice.get(voiceId);
      if (!start) return;
      const color = VOICE_BY_ID[voiceId].color;
      const control = { x: (start.x + target.x) / 2 + (voiceIndex ? 1 : -1) * 45, y: Math.min(start.y, target.y) - 32 };
      for (let mote = 0; mote < 9; mote += 1) {
        const t = clamp(progress * 1.18 - mote * 0.058, 0, 1);
        const point = quadraticPoint(start, control, target, t);
        this.light.fillStyle(color, fade * (0.12 + t * 0.42));
        this.light.fillCircle(point.x, point.y, 1.2 + (mote % 3) * 0.6);
      }
    });
    const ringColor = fx.outcome.kind === 'productive-mistake' ? SCAR : fx.outcome.kind === 'reframe' ? GROWTH : SUN;
    this.world.lineStyle(1.2, ringColor, fade * (0.48 - progress * 0.22));
    this.world.strokeEllipse(target.x, target.y, 18 + progress * 92, 9 + progress * 44);
  }

  private updateLabels(snapshot: SimulationSnapshot, layout: VisualWorldLayout): void {
    const mobile = layout.width < 720;
    for (const site of layout.settlements) {
      const definition = VOICE_BY_ID[site.voiceId];
      const selected = this.selectedVoices.includes(site.voiceId);
      const hovered = this.hoveredVoice === site.voiceId;
      const label = this.labels.get(site.voiceId);
      if (label) {
        const population = site.population >= 1000 ? `${(site.population / 1000).toFixed(1)}k` : String(site.population);
        const detail = mobile || (!selected && !hovered) ? '' : `\n${site.name} · ${population} lives`;
        label.setText(`${definition.shortName}${detail}`);
        label.setFontSize(mobile ? 10 : selected || hovered ? 13 : 11);
        label.setAlpha(selected || hovered ? 1 : 0.74);
        label.setPosition(site.x, site.y + site.radius * 0.7 + 10);
      }
      const selectionLabel = this.selectionLabels.get(site.voiceId);
      if (selectionLabel) {
        const seat = this.selectedVoices.indexOf(site.voiceId);
        selectionLabel.setVisible(seat >= 0);
        if (seat >= 0) {
          selectionLabel.setText(String(seat + 1));
          selectionLabel.setPosition(site.x + site.radius * 0.68, site.y - site.radius * 0.48);
        }
      }
    }

    this.commonsLabel.setText(`COMMON GROUND · ${layout.totalPopulation} LIVES · ${snapshot.laws.length + layout.artifacts.filter((item) => item.domain === 'law').length} LAWS · ${layout.inventionCount} INVENTIONS`);
    this.commonsLabel.setPosition(layout.center.x, layout.center.y + 38 + Math.min(22, snapshot.epoch * 2));
    const latest = layout.works.at(-1);
    const activeAction = layout.lastAction?.verb ?? (snapshot.civicPhase === 'action' ? latest?.work.decision : undefined);
    this.eventLabel.setVisible(Boolean(activeAction && (snapshot.civicPhase === 'action' || snapshot.civicPhase === 'growth')));
    if (activeAction) {
      this.eventLabel.setText(activeAction);
      const anchor = layout.lastAction?.destination ?? latest ?? layout.center;
      this.eventLabel.setPosition(anchor.x, anchor.y - (latest?.radius ?? 14) * 2.2);
    }
  }

  private updateCamera(snapshot: SimulationSnapshot, layout: VisualWorldLayout, delta: number): void {
    let desired = { x: layout.width / 2, y: layout.height / 2, zoom: 1 };
    const selectedSites = this.selectedVoices.map((voice) => layout.settlementByVoice.get(voice)).filter((site): site is SettlementSite => Boolean(site));
    if (snapshot.civicPhase === 'action' || snapshot.civicPhase === 'growth') {
      const focus = layout.lastAction?.destination ?? layout.works.at(-1) ?? layout.center;
      desired = { x: focus.x, y: focus.y, zoom: layout.width < 720 ? 1.03 : 1.1 };
    } else if (snapshot.civicPhase === 'council' || snapshot.civicPhase === 'decision') {
      desired = { x: layout.center.x, y: layout.center.y, zoom: layout.width < 720 ? 1 : 1.045 };
    } else if (selectedSites.length > 0) {
      const x = selectedSites.reduce((sum, site) => sum + site.x, 0) / selectedSites.length;
      const y = selectedSites.reduce((sum, site) => sum + site.y, 0) / selectedSites.length;
      desired = { x, y, zoom: layout.width < 720 ? 1.02 : 1.075 };
    } else {
      const severe = layout.pressures.slice().sort((a, b) => b.severity - a.severity)[0];
      if (severe?.severity && severe.severity > 0.76) desired = { x: severe.x, y: severe.y, zoom: 1.035 };
    }
    const speed = this.reducedMotion ? 1 : 1 - Math.exp(-Math.max(0.001, delta) * 2.5);
    this.cameraRig.x = Phaser.Math.Linear(this.cameraRig.x || desired.x, desired.x, speed);
    this.cameraRig.y = Phaser.Math.Linear(this.cameraRig.y || desired.y, desired.y, speed);
    this.cameraRig.zoom = Phaser.Math.Linear(this.cameraRig.zoom, desired.zoom, speed);
    const camera = this.cameras.main;
    camera.setBounds(-layout.width * 0.3, -layout.height * 0.3, layout.width * 1.6, layout.height * 1.6);
    camera.setZoom(this.cameraRig.zoom);
    camera.centerOn(this.cameraRig.x, this.cameraRig.y);
  }

  private drawPerson(x: number, y: number, color: number, scale: number, direction: WorldPoint, time: number): void {
    const length = Math.max(0.001, Math.hypot(direction.x, direction.y));
    const dx = direction.x / length;
    const dy = direction.y / length;
    const px = -dy;
    const py = dx;
    const stride = this.reducedMotion ? 0 : Math.sin(time * 5) * 0.8 * scale;
    this.world.fillStyle(color, 0.68);
    this.world.fillCircle(x, y - 3.6 * scale, 1.25 * scale);
    this.world.lineStyle(Math.max(0.65, scale), color, 0.72);
    this.world.beginPath();
    this.world.moveTo(x, y - 2.4 * scale);
    this.world.lineTo(x + dx * scale, y + 1.2 * scale);
    this.world.moveTo(x + dx * scale, y + 1.2 * scale);
    this.world.lineTo(x + px * stride - dx * scale, y + 4 * scale + py * stride);
    this.world.moveTo(x + dx * scale, y + 1.2 * scale);
    this.world.lineTo(x - px * stride - dx * scale, y + 4 * scale - py * stride);
    this.world.moveTo(x + dx * scale * 0.2, y - scale * 0.5);
    this.world.lineTo(x + px * scale * 1.7, y + py * scale * 1.7);
    this.world.moveTo(x + dx * scale * 0.2, y - scale * 0.5);
    this.world.lineTo(x - px * scale * 1.7, y - py * scale * 1.7);
    this.world.strokePath();
  }

  private drawPlant(x: number, y: number, size: number, color: number, time: number): void {
    const sway = this.reducedMotion ? 0 : Math.sin(time * 0.7) * size * 0.12;
    this.world.lineStyle(0.6, color, 0.38);
    this.world.beginPath();
    this.world.moveTo(x, y + size);
    this.world.lineTo(x + sway, y - size);
    this.world.moveTo(x + sway * 0.5, y);
    this.world.lineTo(x - size * 0.55, y - size * 0.35);
    this.world.moveTo(x + sway * 0.6, y - size * 0.25);
    this.world.lineTo(x + size * 0.6, y - size * 0.6);
    this.world.strokePath();
    this.world.fillStyle(color, 0.26);
    this.world.fillCircle(x - size * 0.55, y - size * 0.35, 1.2);
    this.world.fillCircle(x + size * 0.6, y - size * 0.6, 1.2);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    const x = pointer.worldX;
    const y = pointer.worldY;
    const hit = this.hitVoice(x, y);
    const civicHit = this.hitCivicTarget(x, y);
    if (hit !== this.hoveredVoice) {
      this.hoveredVoice = hit;
      this.onHoverVoice?.(hit, { x: pointer.x, y: pointer.y });
    } else if (hit) {
      this.onHoverVoice?.(hit, { x: pointer.x, y: pointer.y });
    }
    this.onHoverCivicTarget?.(civicHit, civicHit ? { x: pointer.x, y: pointer.y } : undefined);
    this.game.canvas.style.cursor = hit || civicHit || this.hitLesson(x, y) ? 'pointer' : 'default';
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    const civicTarget = this.hitCivicTarget(pointer.worldX, pointer.worldY);
    if (civicTarget && civicTarget.kind !== 'voice' && this.onCivicTargetSelected) {
      this.onCivicTargetSelected(civicTarget);
      return;
    }
    const voice = this.hitVoice(pointer.worldX, pointer.worldY);
    if (voice) {
      this.onVoiceSelected?.(voice);
      return;
    }
    const lesson = this.hitLesson(pointer.worldX, pointer.worldY);
    if (lesson) this.onLessonSelected?.(lesson);
    else if (civicTarget) this.onCivicTargetSelected?.(civicTarget);
  }

  private hitVoice(x: number, y: number): VoiceId | null {
    for (const [id, position] of this.voicePositions) {
      const dx = (x - position.x) / Math.max(1, position.radius);
      const dy = (y - position.y) / Math.max(1, position.radius * 0.62);
      if (dx * dx + dy * dy <= 1.35) return id;
    }
    return null;
  }

  private hitLesson(x: number, y: number): string | null {
    for (const [id, position] of this.lessonPositions) {
      if (Math.hypot(x - position.x, y - position.y) <= position.radius) return id;
    }
    return null;
  }

  private hitCivicTarget(x: number, y: number): CivicTargetRef | null {
    const hits = this.civicTargetHits
      .filter((hit) => {
        const dx = (x - hit.x) / Math.max(1, hit.radius);
        const dy = (y - hit.y) / Math.max(1, hit.radius * hit.scaleY);
        return dx * dx + dy * dy <= 1;
      })
      .sort((a, b) => a.radius - b.radius);
    return hits[0]?.target ?? null;
  }

  private registerTarget(
    kind: CivicTargetKind,
    id: string,
    point: WorldPoint,
    radius: number,
    scaleY: number,
    layout: VisualWorldLayout,
    secondaryId?: string,
  ): void {
    const target: CivicTargetRef = {
      kind,
      id,
      ...(secondaryId ? { secondaryId } : {}),
      position: {
        x: clamp(point.x / Math.max(1, layout.width), 0, 1),
        y: clamp(point.y / Math.max(1, layout.height), 0, 1),
      },
    };
    this.civicTargetHits.push({ target, x: point.x, y: point.y, radius, scaleY });
  }

  private safeAgencySignature(value: unknown): string {
    if (typeof value !== 'object' || value === null) return '';
    const agency = value as Record<string, unknown>;
    const lengths = ['pressures', 'regions', 'settlements', 'inventions', 'charterLaws', 'cultures', 'arrivals', 'sites', 'actionHistory']
      .map((key) => Array.isArray(agency[key]) ? (agency[key] as unknown[]).length : 0);
    const lastAction = agency.lastAction as { id?: unknown; pulse?: { seed?: unknown } } | null;
    return `${lengths.join(',')}:${String(lastAction?.id ?? lastAction?.pulse?.seed ?? '')}:${String(agency.worldCondition ?? '')}`;
  }

  private workColor(work: CivicWork, index: number): number {
    const fallback = QUALITY_META[work.focus].color;
    const value = work.art.palette[index] ?? work.art.palette[0] ?? fallback;
    return /^#[0-9a-f]{6}$/i.test(value) ? hexColor(value) : hexColor(fallback);
  }

  private drawIrregularLoop(
    graphics: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    seed: number,
    wobble: number,
    color: number,
    alpha: number,
    width: number,
  ): void {
    graphics.lineStyle(width, color, alpha);
    graphics.beginPath();
    const segments = 54;
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = segment / segments * Math.PI * 2;
      const noise = Math.sin(angle * 3 + seed * 0.013) * wobble * 0.52
        + Math.sin(angle * 7 - seed * 0.007) * wobble * 0.31
        + Math.cos(angle * 11 + seed * 0.003) * wobble * 0.17;
      const x = cx + Math.cos(angle) * (rx + noise);
      const y = cy + Math.sin(angle) * (ry + noise * 0.62);
      if (segment === 0) graphics.moveTo(x, y);
      else graphics.lineTo(x, y);
    }
    graphics.closePath();
    graphics.strokePath();
  }

  private strokeQuadratic(
    graphics: Phaser.GameObjects.Graphics,
    start: WorldPoint,
    control: WorldPoint,
    end: WorldPoint,
    color: number,
    alpha: number,
    width: number,
    offset: number,
  ): void {
    graphics.lineStyle(width, color, alpha);
    graphics.beginPath();
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    for (let segment = 0; segment <= 30; segment += 1) {
      const point = quadraticPoint(start, control, end, segment / 30);
      const x = point.x + (-dy / length) * offset;
      const y = point.y + (dx / length) * offset;
      if (segment === 0) graphics.moveTo(x, y);
      else graphics.lineTo(x, y);
    }
    graphics.strokePath();
  }

  private strokePolyline(graphics: Phaser.GameObjects.Graphics, points: WorldPoint[], color: number, alpha: number, width: number): void {
    if (points.length === 0) return;
    graphics.lineStyle(width, color, alpha);
    graphics.beginPath();
    points.forEach((point, index) => index === 0 ? graphics.moveTo(point.x, point.y) : graphics.lineTo(point.x, point.y));
    graphics.strokePath();
  }
}

function quadraticPoint(start: WorldPoint, control: WorldPoint, end: WorldPoint, t: number): WorldPoint {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
  };
}

function quadraticTangent(start: WorldPoint, control: WorldPoint, end: WorldPoint, t: number): WorldPoint {
  return {
    x: 2 * (1 - t) * (control.x - start.x) + 2 * t * (end.x - control.x),
    y: 2 * (1 - t) * (control.y - start.y) + 2 * t * (end.y - control.y),
  };
}

function polylinePoint(points: WorldPoint[], t: number): WorldPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0] as WorldPoint;
  const scaled = clamp(t, 0, 0.999999) * (points.length - 1);
  const index = Math.floor(scaled);
  const local = scaled - index;
  const a = points[index] as WorldPoint;
  const b = points[Math.min(points.length - 1, index + 1)] as WorldPoint;
  return { x: Phaser.Math.Linear(a.x, b.x, local), y: Phaser.Math.Linear(a.y, b.y, local) };
}

function mixColor(a: number, b: number, amount: number): number {
  const ca = Phaser.Display.Color.IntegerToColor(a);
  const cb = Phaser.Display.Color.IntegerToColor(b);
  const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(ca, cb, 100, clamp(amount, 0, 1) * 100);
  return Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);
}

function hexColor(value: string): number {
  return /^#[0-9a-f]{6}$/i.test(value) ? Phaser.Display.Color.HexStringToColor(value).color : BONE;
}

function terrainColor(terrain: string, vitality: number): number {
  const lower = terrain.toLowerCase();
  if (lower.includes('water') || lower.includes('river') || lower.includes('wet')) return mixColor(DEEP_WATER, WATER, vitality * 0.45);
  if (lower.includes('forest') || lower.includes('canopy') || lower.includes('garden')) return mixColor(SOIL, GROWTH, vitality * 0.36);
  if (lower.includes('stone') || lower.includes('mountain') || lower.includes('ridge')) return mixColor(SOIL, STONE, 0.58);
  if (lower.includes('scar') || lower.includes('dry') || lower.includes('waste')) return mixColor(SOIL, SCAR, 0.28);
  return mixColor(LOAM, GROWTH, vitality * 0.2);
}

function pressureColor(kind: string, focus: string): number {
  const lower = `${kind} ${focus}`.toLowerCase();
  if (lower.includes('ecolog') || lower.includes('weather') || lower.includes('water')) return WATER;
  if (lower.includes('scar') || lower.includes('conflict') || lower.includes('boundary')) return SCAR;
  if (lower.includes('wonder') || lower.includes('unknown')) return SUN;
  if (lower.includes('plural') || lower.includes('culture')) return 0xb69ad4;
  return BONE;
}

function stringSeed(value: string): number {
  let seed = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    seed ^= value.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}
