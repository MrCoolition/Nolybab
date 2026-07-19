import Phaser from 'phaser';
import { QUALITY_META, VOICES, VOICE_BY_ID } from '../simulation/content';
import { clamp } from '../simulation/random';
import type { NolybabSimulation } from '../simulation/NolybabSimulation';
import type { CivicWork, Lesson, SimulationSnapshot, VoiceId, WeaveOutcome } from '../simulation/types';

interface Point {
  x: number;
  y: number;
}

interface DustMote {
  x: number;
  y: number;
  phase: number;
  size: number;
  speed: number;
}

interface VoiceScreenState extends Point {
  radius: number;
}

const VOID = 0x0b1210;
const SOIL = 0x18221d;
const BONE = 0xe8ddbd;
const STONE = 0x665b4d;
const WATER = 0x43a99e;
const SCAR = 0xe3664e;
const GROWTH = 0x91b66b;
const SUN = 0xefc45a;

export class NolybabScene extends Phaser.Scene {
  readonly simulation: NolybabSimulation;
  onVoiceSelected?: (voice: VoiceId) => void;
  onLessonSelected?: (lessonId: string) => void;
  onHoverVoice?: (voice: VoiceId | null, point?: Point) => void;

  private world!: Phaser.GameObjects.Graphics;
  private light!: Phaser.GameObjects.Graphics;
  private labels = new Map<VoiceId, Phaser.GameObjects.Text>();
  private selectionLabels = new Map<VoiceId, Phaser.GameObjects.Text>();
  private voicePositions = new Map<VoiceId, VoiceScreenState>();
  private lessonPositions = new Map<string, VoiceScreenState>();
  private selectedVoices: VoiceId[] = [];
  private selectedLessonId: string | null = null;
  private dust: DustMote[] = [];
  private hoveredVoice: VoiceId | null = null;
  private reducedMotion = false;
  private outcomeFx: { outcome: WeaveOutcome; startedAt: number } | null = null;

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

  playOutcome(outcome: WeaveOutcome): void {
    this.outcomeFx = { outcome, startedAt: this.time.now / 1000 };
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0b1210');
    this.world = this.add.graphics();
    this.light = this.add.graphics();
    this.light.setBlendMode(Phaser.BlendModes.ADD);
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.createDust();
    this.createLabels();

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer));
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer));
  }

  update(time: number, delta: number): void {
    this.simulation.update(delta / 1000);
    this.renderWorld(this.simulation.snapshot, time / 1000);
  }

  private createDust(): void {
    let value = this.simulation.snapshot.seed || 1;
    const next = () => {
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      return (value >>> 0) / 4294967296;
    };
    this.dust = Array.from({ length: 110 }, () => ({
      x: next(),
      y: next(),
      phase: next() * Math.PI * 2,
      size: 0.35 + next() * 1.35,
      speed: 0.2 + next() * 0.7,
    }));
  }

  private createLabels(): void {
    for (const voice of VOICES) {
      const label = this.add.text(0, 0, '', {
        fontFamily: 'Palatino Linotype, Iowan Old Style, Georgia, serif',
        fontSize: '16px',
        color: voice.cssColor,
        align: 'center',
        lineSpacing: 4,
        shadow: { color: '#07100d', blur: 8, fill: true, offsetX: 0, offsetY: 2 },
      });
      label.setOrigin(0.5, 0);
      label.setDepth(4);
      this.labels.set(voice.id, label);

      const selectionLabel = this.add.text(0, 0, '', {
        fontFamily: 'Cascadia Mono, Consolas, monospace',
        fontSize: '9px',
        color: '#0b1210',
        backgroundColor: '#e8ddbd',
        padding: { x: 4, y: 2 },
      });
      selectionLabel.setOrigin(0.5);
      selectionLabel.setDepth(6);
      selectionLabel.setVisible(false);
      this.selectionLabels.set(voice.id, selectionLabel);
    }
  }

  private renderWorld(snapshot: SimulationSnapshot, time: number): void {
    const width = this.scale.width;
    const height = this.scale.height;
    if (width < 2 || height < 2) return;
    const mobile = width < 720;
    const cx = width * (mobile ? 0.5 : 0.48);
    const cy = height * (mobile ? 0.47 : 0.49);
    const radiusX = Math.min(width * (mobile ? 0.42 : 0.34), height * (mobile ? 0.24 : 0.4));
    const radiusY = mobile ? Math.min(height * 0.25, radiusX * 1.34) : Math.min(height * 0.31, radiusX * 0.7);
    const breath = this.reducedMotion ? 0 : Math.sin(time * Math.PI * 0.2);
    const epochShift = snapshot.epoch * 0.37;

    this.world.clear();
    this.light.clear();
    this.voicePositions.clear();
    this.lessonPositions.clear();

    this.drawAtmosphere(snapshot, time, width, height, cx, cy, radiusX, radiusY, breath, epochShift);
    this.calculateVoicePositions(snapshot, cx, cy, radiusX, radiusY, time, breath);
    this.drawRelationships(snapshot, time, cx, cy);
    this.drawEcologicalCurrents(snapshot, time, width, height, cx, cy, breath);
    this.drawMountain(snapshot, time, cx, cy, radiusX, radiusY, breath);
    this.drawCivicWorks(snapshot, time, cx, cy, radiusX, radiusY, breath);
    this.drawLexicon(snapshot, time, cx, cy, radiusX, radiusY);
    this.drawVoices(snapshot, time, mobile, breath);
    this.drawSelectionPreview(time, cx, cy);
    this.drawOutcomeFx(time, cx, cy, radiusX, radiusY);
  }

  private drawAtmosphere(
    snapshot: SimulationSnapshot,
    time: number,
    width: number,
    height: number,
    cx: number,
    cy: number,
    radiusX: number,
    radiusY: number,
    breath: number,
    epochShift: number,
  ): void {
    this.world.fillStyle(VOID, 1);
    this.world.fillRect(0, 0, width, height);

    const bio = snapshot.qualities.biosphere;
    const wonder = snapshot.qualities.wonder;
    const glowRings = 9;
    for (let ring = glowRings; ring >= 1; ring -= 1) {
      const progress = ring / glowRings;
      const color = ring % 3 === 0 ? WATER : ring % 2 === 0 ? SOIL : STONE;
      this.world.fillStyle(color, 0.006 + (1 - progress) * 0.012 + bio * 0.006);
      this.world.fillEllipse(cx, cy, radiusX * (1.1 + progress * 1.7), radiusY * (1.15 + progress * 1.8));
    }

    for (let band = 0; band < 13; band += 1) {
      const expansion = band * 16 + breath * (band % 3) * 1.5;
      const wobble = 2.5 + snapshot.knobs.novelty * 4;
      this.drawIrregularLoop(
        this.world,
        cx,
        cy,
        radiusX * 0.55 + expansion,
        radiusY * 0.54 + expansion * 0.66,
        84,
        snapshot.seed + band * 73,
        time * (0.025 + band * 0.001) + epochShift,
        wobble,
        band % 4 === 0 ? WATER : BONE,
        0.025 + wonder * 0.012,
        band % 5 === 0 ? 1.25 : 0.65,
      );
    }

    for (const mote of this.dust) {
      const drift = this.reducedMotion ? 0 : Math.sin(time * mote.speed + mote.phase) * 9;
      const x = mote.x * width + drift;
      const y = mote.y * height + Math.cos(time * mote.speed * 0.7 + mote.phase) * 5;
      const alpha = 0.035 + 0.055 * (0.5 + 0.5 * Math.sin(time * 0.4 + mote.phase));
      this.world.fillStyle(mote.phase % 2 > 1 ? BONE : WATER, alpha);
      this.world.fillCircle(x, y, mote.size);
    }
  }

  private calculateVoicePositions(
    snapshot: SimulationSnapshot,
    cx: number,
    cy: number,
    radiusX: number,
    radiusY: number,
    time: number,
    breath: number,
  ): void {
    snapshot.voices.forEach((state, index) => {
      const voice = VOICE_BY_ID[state.id];
      const angularDrift = this.reducedMotion ? 0 : Math.sin(time * 0.045 * state.cadence + voice.glyphSeed) * 0.035;
      const angle = voice.angle + angularDrift + snapshot.epoch * 0.025 * (index % 2 === 0 ? 1 : -1);
      const pulse = this.reducedMotion ? 0 : breath * (3 + state.presence * 3);
      const x = cx + Math.cos(angle) * (radiusX + pulse);
      const y = cy + Math.sin(angle) * (radiusY + pulse * 0.55);
      const nodeRadius = 20 + state.presence * 16 + state.mutations * 1.8;
      this.voicePositions.set(state.id, { x, y, radius: nodeRadius });
    });
  }

  private drawRelationships(snapshot: SimulationSnapshot, time: number, cx: number, cy: number): void {
    const coherence = snapshot.qualities.coherence;
    for (let index = 0; index < snapshot.relationships.length; index += 1) {
      const relationship = snapshot.relationships[index];
      const start = this.voicePositions.get(relationship.a);
      const end = this.voicePositions.get(relationship.b);
      if (!start || !end) continue;
      const selected = this.selectedVoices.includes(relationship.a) && this.selectedVoices.includes(relationship.b);
      const visible = relationship.strength > 0.08 || selected;
      if (!visible) continue;

      const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      const pull = 0.22 + relationship.strength * 0.28;
      const control = {
        x: midpoint.x + (cx - midpoint.x) * pull,
        y: midpoint.y + (cy - midpoint.y) * pull,
      };
      const alpha = selected ? 0.72 : 0.035 + relationship.strength * 0.29 + coherence * 0.04;
      const width = selected ? 2.6 : 0.5 + relationship.strength * 2.2;
      const aColor = VOICE_BY_ID[relationship.a].color;
      const bColor = VOICE_BY_ID[relationship.b].color;

      this.strokeQuadratic(this.world, start, control, end, aColor, alpha, width, -1.3);
      this.strokeQuadratic(this.world, start, control, end, bColor, alpha * 0.86, Math.max(0.5, width * 0.7), 1.3);

      const pulseCount = Math.min(4, 1 + Math.floor(relationship.exchanges / 2));
      for (let pulse = 0; pulse < pulseCount; pulse += 1) {
        const direction = pulse % 2 === 0 ? 1 : -1;
        const phase = (time * (0.025 + relationship.strength * 0.055) + index * 0.173 + pulse / pulseCount) % 1;
        const t = direction === 1 ? phase : 1 - phase;
        const point = this.quadraticPoint(start, control, end, t);
        const pulseAlpha = 0.18 + relationship.strength * 0.45;
        this.light.fillStyle(pulse % 2 === 0 ? aColor : bColor, pulseAlpha);
        this.light.fillCircle(point.x, point.y, 1.6 + relationship.strength * 2.4);
      }

      if (relationship.tension > 0.63) {
        const count = 7;
        for (let dash = 0; dash < count; dash += 1) {
          const t = (dash + 0.5) / count;
          const point = this.quadraticPoint(start, control, end, t);
          this.world.fillStyle(SCAR, 0.11 + relationship.tension * 0.12);
          this.world.fillCircle(point.x, point.y, 0.8 + (dash % 2) * 0.7);
        }
      }
    }
  }

  private drawEcologicalCurrents(
    snapshot: SimulationSnapshot,
    time: number,
    width: number,
    height: number,
    cx: number,
    cy: number,
    breath: number,
  ): void {
    const bio = snapshot.qualities.biosphere;
    const pressure = snapshot.knobs.ecologicalPressure;
    const streams = 5 + Math.floor(bio * 5);
    for (let stream = 0; stream < streams; stream += 1) {
      const yBase = height * (0.19 + stream * 0.13);
      const points: Point[] = [];
      for (let step = 0; step <= 42; step += 1) {
        const x = (step / 42) * width;
        const distanceFromCenter = Math.abs(x - cx) / Math.max(1, width);
        const bend = Math.sin(step * 0.39 + stream * 1.7 + time * (this.reducedMotion ? 0 : 0.08)) * (7 + bio * 11);
        const orbitDeflection = Math.exp(-distanceFromCenter * 6) * Math.sin(stream * 1.2) * 28;
        points.push({ x, y: yBase + bend + orbitDeflection + breath * 1.5 });
      }
      this.world.lineStyle(0.5 + bio * 0.8, WATER, 0.025 + bio * 0.07);
      this.world.beginPath();
      points.forEach((point, index) => (index === 0 ? this.world.moveTo(point.x, point.y) : this.world.lineTo(point.x, point.y)));
      this.world.strokePath();
    }

    if (pressure > 0.58) {
      const warningRadius = 8 + pressure * 10;
      this.world.lineStyle(1, SCAR, 0.08 + pressure * 0.08);
      this.world.strokeCircle(cx, cy, warningRadius * 7);
    }
  }

  private drawMountain(
    snapshot: SimulationSnapshot,
    time: number,
    cx: number,
    cy: number,
    radiusX: number,
    radiusY: number,
    breath: number,
  ): void {
    const lessonCount = snapshot.lessons.length;
    const memory = snapshot.knobs.memoryPressure;
    const outer = Math.min(radiusX, radiusY) * 0.41;

    for (let layer = Math.min(18, 4 + lessonCount); layer >= 0; layer -= 1) {
      const radius = 26 + layer * 5.4;
      this.drawIrregularLoop(
        this.world,
        cx,
        cy,
        radius + breath * (layer % 2) * 0.5,
        radius * 0.58,
        44,
        snapshot.seed + layer * 109,
        time * 0.018,
        2 + layer * 0.08,
        layer < lessonCount ? SCAR : STONE,
        layer < lessonCount ? 0.08 + memory * 0.055 : 0.075,
        layer < lessonCount ? 1.2 : 0.7,
      );
    }

    this.world.fillStyle(VOID, 0.96);
    this.world.fillEllipse(cx, cy, outer * 0.92, outer * 0.5);
    this.world.lineStyle(1.2, BONE, 0.16 + snapshot.qualities.coherence * 0.08);
    this.world.strokeEllipse(cx, cy, outer * 0.92, outer * 0.5);

    const visibleLessons = snapshot.lessons.slice(-28);
    visibleLessons.forEach((lesson, index) => {
      const angle = ((lesson.glyphSeed % 1000) / 1000) * Math.PI * 2 + snapshot.epoch * 0.09;
      const ring = 0.47 + (index % 5) * 0.11;
      const x = cx + Math.cos(angle) * outer * ring;
      const y = cy + Math.sin(angle) * outer * ring * 0.52;
      const size = 4 + Math.min(6, lesson.depth * 1.2);
      this.lessonPositions.set(lesson.id, { x, y, radius: Math.max(12, size * 2.2) });
      this.drawScarGlyph(lesson, x, y, size, time, this.selectedLessonId === lesson.id);
    });

    if (snapshot.lessons.length === 0) {
      this.world.lineStyle(0.8, BONE, 0.13);
      for (let ray = 0; ray < 7; ray += 1) {
        const angle = (ray / 7) * Math.PI * 2;
        this.world.beginPath();
        this.world.moveTo(cx + Math.cos(angle) * 9, cy + Math.sin(angle) * 5);
        this.world.lineTo(cx + Math.cos(angle) * 22, cy + Math.sin(angle) * 11);
        this.world.strokePath();
      }
    }
  }

  private drawScarGlyph(lesson: Lesson, x: number, y: number, size: number, time: number, selected: boolean): void {
    const color = lesson.resolved ? GROWTH : SCAR;
    const alpha = lesson.resolved ? 0.56 : 0.65 + Math.sin(time * 0.7 + lesson.glyphSeed) * 0.12;
    this.world.lineStyle(selected ? 2.4 : 1.2, selected ? SUN : color, selected ? 0.9 : alpha);
    const arms = 3 + (lesson.glyphSeed % 4);
    for (let arm = 0; arm < arms; arm += 1) {
      const angle = ((arm / arms) * Math.PI * 2 + lesson.glyphSeed * 0.01) % (Math.PI * 2);
      const bend = Math.sin(lesson.glyphSeed * (arm + 1)) * 0.8;
      this.world.beginPath();
      this.world.moveTo(x, y);
      this.world.lineTo(x + Math.cos(angle) * size * 0.65 + bend, y + Math.sin(angle) * size * 0.5);
      this.world.lineTo(x + Math.cos(angle + bend * 0.12) * size * 1.35, y + Math.sin(angle + bend * 0.12) * size);
      this.world.strokePath();
    }
    if (lesson.resolved) {
      this.world.fillStyle(GROWTH, 0.62);
      this.world.fillCircle(x, y, 1.8 + lesson.depth * 0.2);
    }
  }

  private drawCivicWorks(
    snapshot: SimulationSnapshot,
    time: number,
    cx: number,
    cy: number,
    radiusX: number,
    radiusY: number,
    breath: number,
  ): void {
    const works = snapshot.works.slice(-54);
    const builtWeight = snapshot.archivedWorkCount * 0.18 + works.reduce((sum, work) => sum + 0.35 + work.maturity * 0.65, 0);
    const growthRadius = Math.min(radiusX * 0.38, 42 + Math.sqrt(Math.max(1, builtWeight)) * 13);
    const terraces = Math.max(1, Math.min(12, snapshot.epoch + 1 + Math.floor((works.length + snapshot.archivedWorkCount) / 7)));

    for (let terrace = 0; terrace < terraces; terrace += 1) {
      const progress = (terrace + 1) / terraces;
      this.drawIrregularLoop(
        this.world,
        cx,
        cy,
        growthRadius * (0.45 + progress * 0.66) + breath * 0.9,
        growthRadius * (0.22 + progress * 0.31),
        54,
        snapshot.seed + terrace * 211,
        time * (this.reducedMotion ? 0 : 0.012) + terrace * 0.4,
        1.6 + snapshot.qualities.wonder * 2.2,
        terrace === terraces - 1 ? WATER : BONE,
        0.045 + progress * 0.025,
        terrace === terraces - 1 ? 1 : 0.55,
      );
    }

    if (works.length === 0) {
      this.world.lineStyle(0.8, WATER, 0.16);
      this.world.strokeCircle(cx, cy, 34 + breath);
      this.world.fillStyle(BONE, 0.22);
      this.world.fillCircle(cx, cy, 2.2);
      return;
    }

    works.forEach((work, index) => {
      const turn = ((work.glyphSeed % 8192) / 8192) * Math.PI * 2 + Math.floor(index / 10) * 0.23;
      const ring = 0.13 + (index % 9) * 0.023 + Math.floor(index / 9) * 0.045;
      const x = cx + Math.cos(turn) * radiusX * Math.min(0.43, ring);
      const y = cy + Math.sin(turn) * radiusY * Math.min(0.43, ring) * 0.8;
      const maturity = clamp(work.maturity, 0.05, 1);
      const size = 4.5 + maturity * 7 + Math.min(4, work.echoes * 0.5);
      const color = this.artColor(work, 0);
      const secondary = this.artColor(work, 1);

      for (const participant of work.participants.slice(0, 3)) {
        const voice = this.voicePositions.get(participant);
        if (!voice) continue;
        this.world.lineStyle(0.45 + work.resonance * 0.5, color, 0.035 + work.resonance * 0.055);
        this.world.beginPath();
        this.world.moveTo(x, y);
        this.world.lineTo(voice.x, voice.y);
        this.world.strokePath();
      }

      const motion = this.reducedMotion ? 0 : this.workMotion(work, time);
      this.light.fillStyle(color, 0.012 + maturity * 0.026);
      this.light.fillCircle(x, y, size * (2.1 + motion * 0.08));
      this.drawWorkGlyph(work, x, y, size, time, color, secondary, maturity);

      if (index === works.length - 1 && (snapshot.civicPhase === 'action' || snapshot.civicPhase === 'growth')) {
        this.world.lineStyle(1, SUN, 0.24 + Math.sin(time * 2.1) * 0.1);
        this.world.strokeCircle(x, y, size * (1.8 + Math.max(0, breath) * 0.08));
      }
    });
  }

  private drawWorkGlyph(
    work: CivicWork,
    x: number,
    y: number,
    size: number,
    time: number,
    color: number,
    secondary: number,
    maturity: number,
  ): void {
    const phase = this.reducedMotion ? 0 : time * 0.12 + work.glyphSeed * 0.01;
    const layers = 1 + Math.round(work.art.density * 3);
    const symmetry = 3 + Math.round(work.art.symmetry * 5);
    const contested = work.status === 'contested';
    this.world.lineStyle(0.7 + maturity * 0.8, contested ? SCAR : color, 0.25 + maturity * 0.42);

    if (work.art.motif === 'braid' || work.art.geometry === 'braided') {
      for (let strand = -1; strand <= 1; strand += 2) {
        this.world.beginPath();
        for (let step = 0; step <= 18; step += 1) {
          const t = step / 18;
          const px = x - size + t * size * 2;
          const py = y + Math.sin(t * Math.PI * 3 + phase + strand) * size * 0.32 * strand;
          if (step === 0) this.world.moveTo(px, py);
          else this.world.lineTo(px, py);
        }
        this.world.strokePath();
      }
    } else if (work.art.motif === 'threshold') {
      this.world.beginPath();
      this.world.moveTo(x - size, y + size * 0.72);
      this.world.lineTo(x - size, y - size * 0.7);
      this.world.lineTo(x + size, y - size * 0.7);
      this.world.lineTo(x + size, y + size * 0.72);
      this.world.strokePath();
      this.world.lineStyle(0.7, secondary, 0.42);
      this.world.beginPath();
      this.world.moveTo(x, y - size * 0.7);
      this.world.lineTo(x, y + size * 0.9);
      this.world.strokePath();
    } else if (work.art.motif === 'mycelium' || work.art.geometry === 'branching') {
      for (let branch = 0; branch < symmetry; branch += 1) {
        const angle = (branch / symmetry) * Math.PI * 2 + phase * 0.15;
        this.world.beginPath();
        this.world.moveTo(x, y);
        this.world.lineTo(x + Math.cos(angle) * size * 0.62, y + Math.sin(angle) * size * 0.46);
        this.world.lineTo(x + Math.cos(angle + 0.18) * size * 1.18, y + Math.sin(angle + 0.18) * size * 0.88);
        this.world.strokePath();
        this.world.fillStyle(secondary, 0.36);
        this.world.fillCircle(x + Math.cos(angle + 0.18) * size * 1.18, y + Math.sin(angle + 0.18) * size * 0.88, 0.8 + maturity);
      }
    } else if (work.art.motif === 'constellation') {
      const points: Point[] = [];
      for (let star = 0; star < symmetry; star += 1) {
        const angle = (star / symmetry) * Math.PI * 2 + phase * 0.06;
        const distance = size * (0.48 + ((work.glyphSeed >> star) & 3) * 0.18);
        points.push({ x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance * 0.72 });
      }
      this.world.strokePoints(points, true);
      this.world.fillStyle(secondary, 0.5);
      points.forEach((point, index) => this.world.fillCircle(point.x, point.y, 0.8 + (index % 2) * 0.6));
    } else if (work.art.motif === 'current') {
      for (let layer = 0; layer < layers; layer += 1) {
        const offset = (layer - (layers - 1) / 2) * size * 0.28;
        this.world.beginPath();
        for (let step = 0; step <= 20; step += 1) {
          const t = step / 20;
          const px = x - size + t * size * 2;
          const py = y + offset + Math.sin(t * Math.PI * 2 + phase) * size * 0.18;
          if (step === 0) this.world.moveTo(px, py);
          else this.world.lineTo(px, py);
        }
        this.world.strokePath();
      }
    } else if (work.art.motif === 'scar') {
      this.world.beginPath();
      this.world.moveTo(x - size, y - size * 0.5);
      this.world.lineTo(x - size * 0.28, y - size * 0.08);
      this.world.lineTo(x - size * 0.05, y + size * 0.42);
      this.world.lineTo(x + size * 0.38, y - size * 0.18);
      this.world.lineTo(x + size, y + size * 0.52);
      this.world.strokePath();
    } else {
      for (let layer = 0; layer < layers; layer += 1) {
        this.world.lineStyle(0.65 + maturity * 0.55, layer % 2 === 0 ? color : secondary, 0.22 + maturity * 0.33);
        this.world.strokeCircle(x, y, size * (0.45 + layer * 0.24));
      }
    }

    this.world.fillStyle(contested ? SCAR : BONE, 0.32 + maturity * 0.34);
    this.world.fillCircle(x, y, 1.1 + maturity * 1.2);
  }

  private drawOutcomeFx(time: number, cx: number, cy: number, radiusX: number, radiusY: number): void {
    const fx = this.outcomeFx;
    if (!fx) return;
    const age = time - fx.startedAt;
    if (age < 0 || age > 4) {
      this.outcomeFx = null;
      return;
    }
    const progress = clamp(age / 2.8, 0, 1);
    const fade = 1 - clamp((age - 2.5) / 1.5, 0, 1);
    const target = { x: cx, y: cy - radiusY * 0.02 };
    fx.outcome.voices.forEach((voiceId, voiceIndex) => {
      const start = this.voicePositions.get(voiceId);
      if (!start) return;
      const color = VOICE_BY_ID[voiceId].color;
      const control = { x: (start.x + target.x) / 2 + (voiceIndex ? 1 : -1) * radiusX * 0.08, y: cy - radiusY * 0.24 };
      for (let mote = 0; mote < 8; mote += 1) {
        const t = clamp(progress * 1.2 - mote * 0.065, 0, 1);
        const point = this.quadraticPoint(start, control, target, t);
        this.light.fillStyle(color, fade * (0.12 + t * 0.42));
        this.light.fillCircle(point.x, point.y, 1.2 + (mote % 3) * 0.6);
      }
    });

    const ringColor = fx.outcome.kind === 'productive-mistake' ? SCAR : fx.outcome.kind === 'reframe' ? GROWTH : SUN;
    this.world.lineStyle(1.2, ringColor, fade * (0.48 - progress * 0.22));
    this.world.strokeEllipse(target.x, target.y, 18 + progress * 82, 9 + progress * 40);
    if (fx.outcome.kind === 'productive-mistake') {
      this.world.beginPath();
      this.world.moveTo(target.x - 4, target.y - 3);
      this.world.lineTo(target.x + progress * 18, target.y + progress * 12);
      this.world.lineTo(target.x - progress * 25, target.y + progress * 25);
      this.world.strokePath();
    }
  }

  private artColor(work: CivicWork, index: number): number {
    const fallback = QUALITY_META[work.focus].color;
    const value = work.art.palette[index] ?? work.art.palette[0] ?? fallback;
    return /^#[0-9a-f]{6}$/i.test(value) ? Phaser.Display.Color.HexStringToColor(value).color : Phaser.Display.Color.HexStringToColor(fallback).color;
  }

  private workMotion(work: CivicWork, time: number): number {
    const phase = time + work.glyphSeed * 0.013;
    switch (work.art.motion) {
      case 'breathe': return Math.sin(phase * 0.8);
      case 'drift': return Math.sin(phase * 0.23) * 0.7;
      case 'pulse': return Math.sin(phase * 1.8);
      case 'ripple': return Math.sin(phase * 1.15 + Math.sin(phase * 0.2));
      case 'still': return 0;
    }
  }

  private drawLexicon(
    snapshot: SimulationSnapshot,
    time: number,
    cx: number,
    cy: number,
    radiusX: number,
    radiusY: number,
  ): void {
    const words = snapshot.lexicon.slice(-64);
    words.forEach((word, index) => {
      const age = Math.max(0, snapshot.elapsed - word.bornAt);
      const ring = 0.18 + (index % 6) * 0.055 + Math.min(0.15, age * 0.0006);
      const direction = index % 2 === 0 ? 1 : -1;
      const motion = this.reducedMotion ? 0 : time * (0.008 + (word.glyphSeed % 7) * 0.001) * direction;
      const angle = ((word.glyphSeed % 4096) / 4096) * Math.PI * 2 + motion;
      const x = cx + Math.cos(angle) * radiusX * ring;
      const y = cy + Math.sin(angle) * radiusY * ring;
      const qualityColor = Phaser.Display.Color.HexStringToColor(QUALITY_META[word.quality].color).color;
      const size = 1.4 + word.strength * 2.2;
      this.world.fillStyle(qualityColor, 0.24 + word.strength * 0.24);
      this.world.fillCircle(x, y, size);
      if (index % 4 === 0) {
        this.world.lineStyle(0.5, qualityColor, 0.12);
        this.world.beginPath();
        this.world.moveTo(x - size * 1.8, y);
        this.world.lineTo(x + size * 1.8, y);
        this.world.moveTo(x, y - size * 1.8);
        this.world.lineTo(x, y + size * 1.8);
        this.world.strokePath();
      }
    });
  }

  private drawVoices(snapshot: SimulationSnapshot, time: number, mobile: boolean, breath: number): void {
    snapshot.voices.forEach((state, index) => {
      const definition = VOICE_BY_ID[state.id];
      const position = this.voicePositions.get(state.id);
      if (!position) return;
      const selected = this.selectedVoices.includes(state.id);
      const hovered = this.hoveredVoice === state.id;
      const radius = position.radius + (selected ? 6 : hovered ? 3 : 0);
      const pulse = this.reducedMotion ? 0 : breath * (1.2 + state.presence * 1.4);

      this.light.fillStyle(definition.color, 0.025 + state.presence * 0.035 + (selected ? 0.09 : 0));
      this.light.fillCircle(position.x, position.y, radius * (1.8 + snapshot.qualities.wonder * 0.35));

      const petals = 4 + ((definition.glyphSeed + state.mutations) % 5);
      const points: Phaser.Geom.Point[] = [];
      for (let point = 0; point < petals * 2; point += 1) {
        const angle = (point / (petals * 2)) * Math.PI * 2 + time * (this.reducedMotion ? 0 : 0.018 * state.cadence);
        const alternating = point % 2 === 0 ? 1 : 0.48 + snapshot.qualities.plurality * 0.12;
        const noise = Math.sin(point * definition.glyphSeed + snapshot.epoch) * 1.8;
        const pointRadius = (radius + pulse + noise) * alternating;
        points.push(new Phaser.Geom.Point(position.x + Math.cos(angle) * pointRadius, position.y + Math.sin(angle) * pointRadius));
      }
      this.world.fillStyle(definition.color, selected ? 0.3 : 0.14 + state.presence * 0.08);
      this.world.fillPoints(points, true);
      this.world.lineStyle(selected ? 2.2 : 1.05, selected ? BONE : definition.color, selected ? 0.92 : 0.58);
      this.world.strokePoints(points, true);

      this.world.lineStyle(0.75, BONE, 0.25 + state.presence * 0.2);
      this.world.strokeCircle(position.x, position.y, radius * 0.39);
      const spokes = 3 + (definition.glyphSeed % 4);
      for (let spoke = 0; spoke < spokes; spoke += 1) {
        const angle = (spoke / spokes) * Math.PI * 2 - time * (this.reducedMotion ? 0 : 0.012);
        this.world.beginPath();
        this.world.moveTo(position.x + Math.cos(angle) * radius * 0.18, position.y + Math.sin(angle) * radius * 0.18);
        this.world.lineTo(position.x + Math.cos(angle) * radius * 0.62, position.y + Math.sin(angle) * radius * 0.62);
        this.world.strokePath();
      }

      const moteCount = 4 + Math.floor(state.presence * 8) + Math.min(4, state.mutations);
      for (let mote = 0; mote < moteCount; mote += 1) {
        const moteAngle =
          (mote / moteCount) * Math.PI * 2 +
          (this.reducedMotion ? 0 : time * (0.1 + state.cadence * 0.035) * (mote % 2 === 0 ? 1 : -1));
        const orbit = radius * (1.2 + (mote % 3) * 0.17);
        const x = position.x + Math.cos(moteAngle) * orbit;
        const y = position.y + Math.sin(moteAngle) * orbit * 0.7;
        this.world.fillStyle(mote % 3 === 0 ? BONE : definition.color, 0.26 + state.presence * 0.3);
        this.world.fillCircle(x, y, 1 + (mote % 2) * 0.7);
      }

      const label = this.labels.get(state.id);
      if (label) {
        const above =
          state.id !== 'pioneers' &&
          (Math.sin(definition.angle) < -0.15 || position.y > this.scale.height * 0.67);
        const title = mobile || (!selected && !hovered) ? definition.shortName : `${definition.shortName}\n${definition.domain}`;
        label.setText(title);
        label.setFontSize(mobile ? 11 : selected || hovered ? 15 : 13);
        label.setAlpha(selected || hovered ? 1 : 0.7);
        label.setPosition(position.x, above ? position.y - radius - (mobile ? 28 : 44) : position.y + radius + 9);
        label.setOrigin(0.5, above ? 0 : 0);
      }

      if (selected) {
        this.world.lineStyle(1, BONE, 0.38);
        this.world.strokeCircle(position.x, position.y, radius * 1.42 + Math.sin(time * 1.4 + index) * 2);
      }

      const selectionLabel = this.selectionLabels.get(state.id);
      if (selectionLabel) {
        const seat = this.selectedVoices.indexOf(state.id);
        selectionLabel.setVisible(seat >= 0);
        if (seat >= 0) {
          selectionLabel.setText(String(seat + 1));
          selectionLabel.setPosition(position.x + radius * 0.76, position.y - radius * 0.76);
        }
      }
    });
  }

  private drawSelectionPreview(time: number, cx: number, cy: number): void {
    if (this.selectedVoices.length !== 2) return;
    const start = this.voicePositions.get(this.selectedVoices[0] as VoiceId);
    const end = this.voicePositions.get(this.selectedVoices[1] as VoiceId);
    if (!start || !end) return;
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const control = { x: midpoint.x + (cx - midpoint.x) * 0.48, y: midpoint.y + (cy - midpoint.y) * 0.48 };
    const alpha = 0.46 + Math.sin(time * 2.2) * 0.16;
    this.strokeQuadratic(this.light, start, control, end, BONE, alpha, 2.2, 0);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    const hit = this.hitVoice(pointer.x, pointer.y);
    if (hit !== this.hoveredVoice) {
      this.hoveredVoice = hit;
      this.onHoverVoice?.(hit, { x: pointer.x, y: pointer.y });
      this.game.canvas.style.cursor = hit ? 'pointer' : this.hitLesson(pointer.x, pointer.y) ? 'pointer' : 'default';
    } else if (hit) {
      this.onHoverVoice?.(hit, { x: pointer.x, y: pointer.y });
    }
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    const voice = this.hitVoice(pointer.x, pointer.y);
    if (voice) {
      this.onVoiceSelected?.(voice);
      return;
    }
    const lesson = this.hitLesson(pointer.x, pointer.y);
    if (lesson) this.onLessonSelected?.(lesson);
  }

  private hitVoice(x: number, y: number): VoiceId | null {
    for (const [id, position] of this.voicePositions) {
      const distance = Math.hypot(x - position.x, y - position.y);
      if (distance <= Math.max(26, position.radius * 1.25)) return id;
    }
    return null;
  }

  private hitLesson(x: number, y: number): string | null {
    for (const [id, position] of this.lessonPositions) {
      if (Math.hypot(x - position.x, y - position.y) <= position.radius) return id;
    }
    return null;
  }

  private drawIrregularLoop(
    graphics: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    segments: number,
    seed: number,
    drift: number,
    wobble: number,
    color: number,
    alpha: number,
    width: number,
  ): void {
    graphics.lineStyle(width, color, alpha);
    graphics.beginPath();
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      const noise =
        Math.sin(angle * 3 + seed * 0.013 + drift) * wobble * 0.52 +
        Math.sin(angle * 7 - seed * 0.007 - drift * 0.7) * wobble * 0.31 +
        Math.cos(angle * 11 + seed * 0.003) * wobble * 0.17;
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
    start: Point,
    control: Point,
    end: Point,
    color: number,
    alpha: number,
    width: number,
    offset: number,
  ): void {
    graphics.lineStyle(width, color, alpha);
    graphics.beginPath();
    for (let segment = 0; segment <= 30; segment += 1) {
      const t = segment / 30;
      const point = this.quadraticPoint(start, control, end, t);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const x = point.x + (-dy / length) * offset;
      const y = point.y + (dx / length) * offset;
      if (segment === 0) graphics.moveTo(x, y);
      else graphics.lineTo(x, y);
    }
    graphics.strokePath();
  }

  private quadraticPoint(start: Point, control: Point, end: Point, t: number): Point {
    const inverse = 1 - t;
    return {
      x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
      y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
    };
  }
}
