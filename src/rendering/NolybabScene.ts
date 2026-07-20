import Phaser from 'phaser';
import { VOICE_BY_ID } from '../simulation/content';
import { clamp } from '../simulation/random';
import type { NolybabSimulation } from '../simulation/NolybabSimulation';
import type { CivicTargetKind, CivicTargetRef, SimulationSnapshot, VoiceId, WeaveOutcome } from '../simulation/types';
import {
  buildVisualWorld,
  hashSigned,
  hashUnit,
  type ArtifactSite,
  type ArrivalSite,
  type BridgeSite,
  type FieldSite,
  type GuildCrewSite,
  type PressureSite,
  type RegionSite,
  type RouteSite,
  type SettlementSite,
  type TreeSite,
  type VisualWorldLayout,
  type WorkSite,
  type WorldPoint,
} from './visualModel';

interface HitArea extends WorldPoint {
  radius: number;
}

interface WorldTargetHit extends HitArea {
  target: CivicTargetRef;
  scaleY: number;
}

const INK = 0x26362d;
const DEEP_INK = 0x102d28;
const BACKGROUND = 0x153c35;
const DISTANT = 0x285d50;
const LAND_SHADOW = 0x0d2723;
const LAND = 0xabc07f;
const LAND_LIGHT = 0xd1d7a0;
const SOIL = 0xa9794f;
const PATH = 0xe2cf9a;
const CREAM = 0xfff0c9;
const WATER = 0x4eb4bf;
const WATER_LIGHT = 0x9de3dc;
const WATER_DEEP = 0x216b72;
const LEAF = 0x2f7951;
const LEAF_LIGHT = 0x68a85e;
const LEAF_DARK = 0x24583d;
const SUN = 0xf4c857;
const CORAL = 0xdd684f;
const SKY = 0x6db4c6;
const VIOLET = 0x8c6dae;
const WOOD = 0x7d4c35;
const STONE = 0x7d8170;

/**
 * A living civic diorama. The simulation owns facts; this scene turns those
 * facts into places, bodies and visible work. No gameplay value is invented
 * here and snapshot.agency is consumed directly.
 */
export class NolybabScene extends Phaser.Scene {
  readonly simulation: NolybabSimulation;
  onVoiceSelected?: (voice: VoiceId) => void;
  onLessonSelected?: (lessonId: string) => void;
  onHoverVoice?: (voice: VoiceId | null, point?: WorldPoint) => void;
  onCivicTargetSelected?: (target: CivicTargetRef) => void;
  onHoverCivicTarget?: (target: CivicTargetRef | null, point?: WorldPoint) => void;

  private ground!: Phaser.GameObjects.Graphics;
  private world!: Phaser.GameObjects.Graphics;
  private actors!: Phaser.GameObjects.Graphics;
  private highlights!: Phaser.GameObjects.Graphics;
  private settlementLabels = new Map<string, Phaser.GameObjects.Text>();
  private guildLabels = new Map<VoiceId, Phaser.GameObjects.Text>();
  private transientLabels = new Map<string, Phaser.GameObjects.Text>();
  private commonsLabel!: Phaser.GameObjects.Text;
  private eventLabel!: Phaser.GameObjects.Text;
  private selectedVoices: VoiceId[] = [];
  private selectedLessonId: string | null = null;
  private selectedCivicTarget: CivicTargetRef | null = null;
  private hoveredVoice: VoiceId | null = null;
  private voicePositions = new Map<VoiceId, HitArea>();
  private lessonPositions = new Map<string, HitArea>();
  private civicTargetHits: WorldTargetHit[] = [];
  private layout: VisualWorldLayout | null = null;
  private layoutKey = '';
  private terrainKey = '';
  private reducedMotion = false;
  private outcomeFx: { outcome: WeaveOutcome; startedAt: number } | null = null;

  constructor(simulation: NolybabSimulation) {
    super({ key: 'NolybabScene' });
    this.simulation = simulation;
  }

  setSelectedVoices(voices: VoiceId[]): void {
    this.selectedVoices = [...voices];
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
    this.cameras.main.setBackgroundColor('#153c35');
    this.ground = this.add.graphics().setDepth(0);
    this.world = this.add.graphics().setDepth(2);
    this.actors = this.add.graphics().setDepth(4);
    this.highlights = this.add.graphics().setDepth(6);
    this.highlights.setBlendMode(Phaser.BlendModes.ADD);
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.commonsLabel = this.add.text(0, 0, 'OPEN COMMONS', {
      fontFamily: 'Cascadia Mono, Consolas, monospace',
      fontSize: '10px',
      fontStyle: 'bold',
      color: '#fff0c9',
      backgroundColor: 'rgba(16,45,40,0.84)',
      padding: { x: 7, y: 4 },
      letterSpacing: 1.2,
    }).setOrigin(0.5, 0).setDepth(9);

    this.eventLabel = this.add.text(0, 0, '', {
      fontFamily: 'Palatino Linotype, Georgia, serif',
      fontSize: '15px',
      fontStyle: 'bold italic',
      color: '#26362d',
      backgroundColor: 'rgba(255,240,201,0.94)',
      padding: { x: 10, y: 6 },
      shadow: { color: '#102d28', blur: 5, fill: true, offsetX: 0, offsetY: 2 },
    }).setOrigin(0.5, 1).setDepth(12).setVisible(false);

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer));
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer));
    this.scale.on('resize', () => {
      this.layoutKey = '';
      this.terrainKey = '';
    });
  }

  update(timeMs: number, deltaMs: number): void {
    this.simulation.update(deltaMs / 1000);
    this.renderWorld(this.simulation.snapshot, timeMs / 1000);
  }

  private renderWorld(snapshot: SimulationSnapshot, time: number): void {
    const width = this.scale.width;
    const height = this.scale.height;
    if (width < 2 || height < 2) return;
    const signature = this.agencySignature(snapshot);
    const layoutKey = `${snapshot.seed}|${width}|${height}|${snapshot.epoch}|${snapshot.cycle}|${signature}`;
    if (!this.layout || this.layoutKey !== layoutKey) {
      this.layout = buildVisualWorld(snapshot, width, height);
      this.layoutKey = layoutKey;
    }
    const layout = this.layout;
    const terrainKey = `${snapshot.seed}|${width}|${height}|${snapshot.epoch}|${Math.round(snapshot.qualities.biosphere * 20)}|${Math.round(snapshot.knobs.ecologicalPressure * 20)}|${signature}`;
    if (terrainKey !== this.terrainKey) {
      this.drawTerrain(snapshot, layout);
      this.terrainKey = terrainKey;
    }

    this.world.clear();
    this.actors.clear();
    this.highlights.clear();
    this.voicePositions.clear();
    this.lessonPositions.clear();
    this.civicTargetHits = [];

    this.drawRegionTexture(layout.regions);
    this.drawRoutes(layout.routes, time);
    this.drawFields(layout.fields, time);
    this.drawBridges(layout.bridges, time);
    this.drawWorks(layout.works, time);
    this.drawArtifacts(layout.artifacts, time);
    this.drawSettlements(layout.settlements, time);
    this.drawGuildCrews(layout.guilds, time);
    this.drawCommons(snapshot, layout, time);
    this.drawArrivals(layout.arrivals, time);
    this.drawPressures(layout.pressures, time);
    this.drawMemoryTerraces(snapshot, layout, time);
    this.drawLastAction(layout, time);
    this.drawOutcome(time, layout);
    this.drawSelection(time);
    this.updateLabels(snapshot, layout);
    this.lockCamera(layout);
  }

  private drawTerrain(snapshot: SimulationSnapshot, layout: VisualWorldLayout): void {
    const { bounds } = layout;
    this.ground.clear();
    this.ground.fillStyle(BACKGROUND, 1);
    this.ground.fillRect(0, 0, layout.width, layout.height);

    // Distant sunlit terraces give the world a horizon without fogging it.
    this.ground.fillStyle(DISTANT, 0.74);
    this.ground.beginPath();
    this.ground.moveTo(0, bounds.top + 65);
    for (let step = 0; step <= 18; step += 1) {
      const x = step / 18 * layout.width;
      const y = bounds.top + 46 + Math.sin(step * 0.9 + snapshot.seed * 0.001) * 15;
      this.ground.lineTo(x, y);
    }
    this.ground.lineTo(layout.width, bounds.bottom + 30);
    this.ground.lineTo(0, bounds.bottom + 42);
    this.ground.closePath();
    this.ground.fillPath();

    // One tangible, high-contrast landmass replaces the old node graph.
    this.ground.fillStyle(LAND_SHADOW, 0.48);
    this.drawOrganicFill(this.ground, layout.center.x + 8, layout.center.y + 15, bounds.width * 0.5, bounds.height * 0.53, snapshot.seed, 17);
    this.ground.fillStyle(LAND, 1);
    this.drawOrganicFill(this.ground, layout.center.x, layout.center.y, bounds.width * 0.5, bounds.height * 0.53, snapshot.seed, 17);
    this.ground.lineStyle(2, LAND_LIGHT, 0.74);
    this.drawOrganicStroke(this.ground, layout.center.x, layout.center.y, bounds.width * 0.5, bounds.height * 0.53, snapshot.seed, 17);

    const biomeColor: Record<string, number> = {
      wetland: 0x70afa0,
      canopy: 0x5b9859,
      meadow: 0xbdd288,
      stone: 0x9b9a7c,
      cultivated: 0xcbb872,
      scarland: 0xc87b61,
    };
    layout.terrain.forEach((patch) => {
      const color = biomeColor[patch.kind] ?? LAND;
      this.ground.fillStyle(color, 0.3 + patch.vitality * 0.22);
      this.drawOrganicFill(this.ground, patch.x, patch.y, patch.rx, patch.ry, patch.seed, 8);
      if (patch.kind === 'stone') {
        for (let rock = 0; rock < 3; rock += 1) this.drawGroundRock(patch.x + hashSigned(patch.seed, rock + 11) * patch.rx * 0.65, patch.y + hashSigned(patch.seed, rock + 21) * patch.ry * 0.65, 4 + rock, patch.seed + rock);
      }
    });

    // The river is broad and unmistakably water.
    this.strokePolyline(this.ground, layout.river, WATER_DEEP, 0.48, 25);
    this.strokePolyline(this.ground, layout.river, WATER, 1, 19);
    this.strokePolyline(this.ground, layout.river, WATER_LIGHT, 0.72, 3);
    layout.tributaries.forEach((path) => {
      this.strokePolyline(this.ground, path, WATER_DEEP, 0.42, 8);
      this.strokePolyline(this.ground, path, WATER, 0.96, 5);
    });

    // Trees are planted into the static layer so the diorama remains full.
    const orderedTrees = [...layout.trees].sort((a, b) => a.y - b.y);
    orderedTrees.forEach((tree) => this.drawTree(this.ground, tree));
  }

  private drawRegionTexture(regions: RegionSite[]): void {
    for (const region of regions) {
      const color = region.vitality > 0.62 ? LEAF_LIGHT : region.pressure > 0.52 ? CORAL : CREAM;
      this.world.lineStyle(1, color, 0.1 + region.openness * 0.08);
      this.drawOrganicStroke(this.world, region.x, region.y, region.radius, region.radius * 0.54, region.seed, 6);
      // Region boundaries are land-use seams, not glowing nodes.
      for (let mark = 0; mark < 4; mark += 1) {
        const angle = hashUnit(region.seed, mark + 91) * Math.PI * 2;
        const x = region.x + Math.cos(angle) * region.radius * 0.74;
        const y = region.y + Math.sin(angle) * region.radius * 0.38;
        this.world.fillStyle(color, 0.32);
        this.world.fillCircle(x, y, 1.5 + region.vitality * 1.4);
      }
      this.registerTarget('region', region.id, region, region.radius * 0.82, 0.58);
    }
  }

  private drawRoutes(routes: RouteSite[], time: number): void {
    routes.forEach((route) => {
      const isWater = route.kind === 'water-channel';
      const color = isWater ? WATER_DEEP : route.kind === 'trade' ? SOIL : PATH;
      const width = isWater ? 3.2 : route.kind === 'trade' ? 2.3 : 4.2;
      const alpha = isWater ? 0.7 : route.kind === 'trade' ? 0.28 : 0.6;
      this.strokeQuadratic(this.world, route.start, route.control, route.end, color, alpha, width);
      if (!isWater) this.strokeQuadratic(this.world, route.start, route.control, route.end, CREAM, 0.2, 1);
      const travelerCount = route.kind === 'trade' ? 2 : route.kind === 'footpath' ? 1 : 0;
      for (let traveler = 0; traveler < travelerCount; traveler += 1) {
        const t = this.reducedMotion ? 0.45 + traveler * 0.12 : (time * (0.035 + route.strength * 0.025) + traveler * 0.43 + hashUnit(route.seed, traveler)) % 1;
        const point = quadraticPoint(route.start, route.control, route.end, t);
        const tangent = quadraticTangent(route.start, route.control, route.end, t);
        this.drawPerson(point.x, point.y, route.kind === 'trade' ? SUN : CREAM, 1.18, tangent, time + traveler);
      }
      if (route.a && route.b) {
        const middle = quadraticPoint(route.start, route.control, route.end, 0.5);
        this.registerTarget('relationship', route.a, middle, 13, 0.6, route.b);
      }
    });
  }

  private drawFields(fields: FieldSite[], time: number): void {
    fields.forEach((field) => {
      this.world.save();
      this.world.translateCanvas(field.x, field.y);
      this.world.rotateCanvas(field.rotation);
      this.world.fillStyle(field.crop === 'wetland' ? 0x6ba79a : 0xc8ad63, 0.9);
      this.world.fillRoundedRect(-field.width / 2, -field.height / 2, field.width, field.height, 4);
      this.world.lineStyle(1, field.crop === 'wetland' ? WATER_LIGHT : CREAM, 0.72);
      const rows = 4;
      for (let row = 0; row < rows; row += 1) {
        const y = -field.height * 0.35 + row * field.height * 0.23;
        this.world.beginPath();
        this.world.moveTo(-field.width * 0.42, y);
        this.world.lineTo(field.width * 0.42, y);
        this.world.strokePath();
        for (let plant = 0; plant < 5; plant += 1) {
          const x = -field.width * 0.34 + plant * field.width * 0.17;
          const sway = this.reducedMotion ? 0 : Math.sin(time * 1.2 + field.seed + plant) * 0.7;
          this.world.lineStyle(1, field.crop === 'beans' ? LEAF_DARK : LEAF, 0.9);
          this.world.lineBetween(x, y + 2, x + sway, y - 2.5 - field.maturity * 2);
        }
      }
      this.world.restore();
    });
  }

  private drawBridges(bridges: BridgeSite[], time: number): void {
    bridges.forEach((bridge, index) => {
      const dx = Math.cos(bridge.angle) * bridge.length * 0.5;
      const dy = Math.sin(bridge.angle) * bridge.length * 0.5;
      this.world.lineStyle(8, WOOD, 0.98);
      this.world.lineBetween(bridge.x - dx, bridge.y - dy, bridge.x + dx, bridge.y + dy);
      this.world.lineStyle(2, CREAM, 0.85);
      const slats = 7;
      for (let slat = 0; slat <= slats; slat += 1) {
        const t = slat / slats;
        const x = bridge.x - dx + dx * 2 * t;
        const y = bridge.y - dy + dy * 2 * t;
        const px = -Math.sin(bridge.angle) * 4;
        const py = Math.cos(bridge.angle) * 4;
        this.world.lineBetween(x - px, y - py, x + px, y + py);
      }
      if (index === 0) {
        const walk = this.reducedMotion ? 0.5 : (time * 0.08) % 1;
        this.drawPerson(bridge.x - dx + dx * 2 * walk, bridge.y - dy + dy * 2 * walk, CORAL, 1.1, { x: dx, y: dy }, time);
      }
    });
  }

  private drawWorks(works: WorkSite[], time: number): void {
    works.forEach((site) => {
      const primary = hexColor(site.art.palette[0] ?? '#f4c857', SUN);
      const secondary = hexColor(site.art.palette[1] ?? '#fff0c9', CREAM);
      const scale = 0.72 + site.maturity * 0.55;
      switch (site.kind) {
        case 'listening-ritual':
        case 'witness-circle':
          this.drawAssemblyCircle(site.x, site.y, 15 * scale, primary, time, site.seed);
          break;
        case 'ecological-covenant':
          this.drawGarden(site.x, site.y, 16 * scale, primary, time, site.seed);
          break;
        case 'translation-braid':
          this.drawSignalMast(site.x, site.y, 19 * scale, primary, secondary, time);
          break;
        case 'memory-practice':
          this.drawArchive(site.x, site.y, 16 * scale, primary);
          break;
        case 'consent-protocol':
          this.drawThreshold(site.x, site.y, 18 * scale, primary, secondary);
          break;
        default:
          this.drawWorkshop(site.x, site.y, 18 * scale, primary, secondary, time, site.seed);
      }
      if (site.construction < 0.98) this.drawScaffold(site.x, site.y, 18 * scale, site.construction, time, site.seed);
      this.registerTarget('work', site.id, site, 20 * scale, 0.72);
    });
  }

  private drawArtifacts(artifacts: ArtifactSite[], time: number): void {
    artifacts.forEach((site) => {
      const primary = hexColor(site.palette[0] ?? '#f4c857', SUN);
      const secondary = hexColor(site.palette[1] ?? '#fff0c9', CREAM);
      const scale = 0.72 + site.maturity * 0.62;
      if (site.domain === 'law') {
        this.drawThreshold(site.x, site.y, 21 * scale, primary, secondary);
        // A law physically changes the path: its gate is open by contestability.
        this.world.fillStyle(primary, 0.9);
        this.world.fillTriangle(site.x - 13 * scale, site.y - 19 * scale, site.x, site.y - 25 * scale, site.x + 13 * scale, site.y - 19 * scale);
      } else if (site.domain === 'culture') {
        this.drawFestival(site.x, site.y, 19 * scale, primary, secondary, time, site.seed);
      } else if (site.domain === 'invention') {
        this.drawInvention(site, scale, primary, secondary, time);
      } else {
        this.drawCivicSite(site, scale, primary, secondary, time);
      }
      if (site.maturity < 0.72 || site.status === 'growing') this.drawScaffold(site.x, site.y, 21 * scale, site.maturity, time, site.seed);
      this.registerTarget(site.domain === 'site' ? 'site' : site.domain, site.id, site, 24 * scale, 0.78);
    });
  }

  private drawSettlements(settlements: SettlementSite[], time: number): void {
    const ordered = [...settlements].sort((a, b) => a.y - b.y);
    ordered.forEach((settlement) => {
      const roof = hexColor(settlement.palette[0] ?? '#dd684f', CORAL);
      const wall = hexColor(settlement.palette[1] ?? '#fff0c9', CREAM);
      const habitatScale = 1.08 + Math.min(0.95, Math.sqrt(Math.max(3, settlement.inhabitants)) * 0.095 + settlement.maturity * 0.48);
      const houseCount = Math.max(2, Math.min(11, Math.ceil(settlement.inhabitants / 8) + Math.floor(settlement.maturity * 3)));

      // Lived-in ground: paths, hearth and domestic gardens.
      this.world.fillStyle(SOIL, 0.35);
      this.world.fillEllipse(settlement.x, settlement.y + 8, settlement.radius * 1.72, settlement.radius * 0.86);
      this.world.lineStyle(5, PATH, 0.74);
      this.world.lineBetween(settlement.x, settlement.y + 4, settlement.x + settlement.radius * 0.88, settlement.y + settlement.radius * 0.28);
      this.world.lineStyle(1.3, CREAM, 0.44);
      this.world.lineBetween(settlement.x, settlement.y + 4, settlement.x + settlement.radius * 0.88, settlement.y + settlement.radius * 0.28);

      for (let house = 0; house < houseCount; house += 1) {
        const ring = Math.floor(house / 4);
        const angle = hashUnit(settlement.seed, 510 + house) * Math.PI * 2;
        const distance = house === 0 ? 0 : 22 + ring * 18 + hashUnit(settlement.seed, 560 + house) * 7;
        const x = settlement.x + Math.cos(angle) * distance;
        const y = settlement.y + Math.sin(angle) * distance * 0.48;
        const size = habitatScale * (house === 0 ? 1.28 : 0.86 + hashUnit(settlement.seed, 580 + house) * 0.18);
        this.drawHouse(x, y, size, roof, wall, settlement.form, house, time);
      }

      const flame = 0.7 + (this.reducedMotion ? 0 : Math.sin(time * 5 + settlement.seed) * 0.18);
      this.world.fillStyle(WOOD, 1);
      this.world.fillRect(settlement.x - 5, settlement.y + 17, 10, 2);
      this.highlights.fillStyle(SUN, 0.26);
      this.highlights.fillCircle(settlement.x, settlement.y + 16, 15);
      this.actors.fillStyle(SUN, 1);
      this.actors.fillTriangle(settlement.x - 3, settlement.y + 16, settlement.x, settlement.y + 8 - flame * 3, settlement.x + 3, settlement.y + 16);

      const visiblePeople = Math.max(3, Math.min(18, settlement.inhabitants));
      for (let person = 0; person < visiblePeople; person += 1) {
        const phase = hashUnit(settlement.seed, 700 + person) * Math.PI * 2;
        const speed = 0.14 + hashUnit(settlement.seed, 760 + person) * 0.12;
        const angle = phase + (this.reducedMotion ? 0 : time * speed) * (person % 2 ? 1 : -1);
        const radius = 16 + hashUnit(settlement.seed, 790 + person) * Math.max(16, settlement.radius * 0.62);
        const x = settlement.x + Math.cos(angle) * radius;
        const y = settlement.y + 12 + Math.sin(angle) * radius * 0.36;
        const direction = { x: -Math.sin(angle) * (person % 2 ? 1 : -1), y: Math.cos(angle) * 0.36 * (person % 2 ? 1 : -1) };
        const clothing = person % 4 === 0 ? roof : person % 4 === 1 ? SKY : person % 4 === 2 ? SUN : LEAF_DARK;
        this.drawPerson(x, y, clothing, 1.5 + (person % 3) * 0.13, direction, time + phase);
      }

      if (settlement.maturity < 0.64 || settlement.traits.includes('almost-empty')) {
        this.drawScaffold(settlement.x - settlement.radius * 0.45, settlement.y - 5, 25 * habitatScale, settlement.maturity, time, settlement.seed);
      }
      this.registerTarget('settlement', settlement.id, settlement, settlement.radius, 0.65);
    });
  }

  private drawGuildCrews(guilds: GuildCrewSite[], time: number): void {
    guilds.forEach((guild, index) => {
      const color = hexColor(guild.color, SUN);
      const selected = this.selectedVoices.includes(guild.voiceId);
      const bob = this.reducedMotion ? 0 : Math.sin(time * 1.4 + guild.seed) * 1.5;
      // A cloth work-banner marks a mobile crew without becoming a node.
      this.actors.lineStyle(2, WOOD, 1);
      this.actors.lineBetween(guild.x, guild.y + 9, guild.x, guild.y - 16 + bob);
      this.actors.fillStyle(color, 1);
      this.actors.fillTriangle(guild.x, guild.y - 16 + bob, guild.x + 15, guild.y - 11 + bob, guild.x, guild.y - 5 + bob);
      this.actors.lineStyle(1, CREAM, 0.75);
      this.actors.lineBetween(guild.x + 2, guild.y - 13 + bob, guild.x + 10, guild.y - 11 + bob);
      // Civic voices are roles carried by the settlement, not extra phantom
      // inhabitants. Their banners/tools remain selectable without inflating
      // the visible human census.
      if (guild.activity === 'building' || guild.activity === 'repairing') {
        this.actors.fillStyle(WOOD, 1);
        this.actors.fillRect(guild.x + 12, guild.y + 5, 14, 3);
      } else if (guild.activity === 'tending') {
        this.drawPlant(this.actors, guild.x + 14, guild.y + 6, 7, LEAF_LIGHT, time + index);
      } else if (guild.activity === 'mapping') {
        this.actors.fillStyle(CREAM, 1);
        this.actors.fillRect(guild.x + 10, guild.y + 1, 11, 8);
        this.actors.lineStyle(1, SKY, 1);
        this.actors.lineBetween(guild.x + 12, guild.y + 6, guild.x + 19, guild.y + 3);
      }
      if (selected) {
        this.highlights.lineStyle(2, color, 0.88);
        this.highlights.strokeEllipse(guild.x, guild.y + 2, 48, 28);
      }
      this.voicePositions.set(guild.voiceId, { x: guild.x, y: guild.y, radius: 23 });
      this.registerTarget('voice', guild.voiceId, guild, 23, 0.7);
    });
  }

  private drawCommons(snapshot: SimulationSnapshot, layout: VisualWorldLayout, time: number): void {
    const { x, y } = layout.commons;
    this.world.fillStyle(PATH, 0.86);
    this.world.fillEllipse(x, y + 3, 62, 35);
    this.world.lineStyle(2, CREAM, 0.9);
    this.world.strokeEllipse(x, y + 3, 62, 35);
    const seats = 9;
    for (let seat = 0; seat < seats; seat += 1) {
      const angle = seat / seats * Math.PI * 2;
      const sx = x + Math.cos(angle) * 25;
      const sy = y + 3 + Math.sin(angle) * 13;
      this.world.fillStyle(seat % 3 === 0 ? CORAL : WOOD, 1);
      this.world.fillEllipse(sx, sy, 7, 4);
    }
    const pulse = this.reducedMotion ? 0 : Math.sin(time * 1.2) * 2;
    this.highlights.lineStyle(1.5, SUN, 0.3);
    this.highlights.strokeEllipse(x, y + 3, 68 + pulse, 39 + pulse * 0.5);
    this.registerTarget('commons', 'commons', layout.commons, 34, 0.58);
    this.commonsLabel.setPosition(x, y + 50);
    this.commonsLabel.setText(`OPEN COMMONS  ·  ${layout.totalPopulation} PEOPLE  ·  ${snapshot.agency.charterLaws.length} LIVING LAWS`);
  }

  private drawArrivals(arrivals: ArrivalSite[], time: number): void {
    arrivals.forEach((arrival) => {
      if (['settled', 'welcomed'].includes(arrival.status)) return;
      const control = {
        x: (arrival.origin.x + arrival.destination.x) * 0.5,
        y: Math.min(arrival.origin.y, arrival.destination.y) - 52 + hashSigned(arrival.seed, 902) * 25,
      };
      this.strokeQuadratic(this.world, arrival.origin, control, arrival.destination, SUN, 0.68, 2.2);
      this.strokeQuadratic(this.world, arrival.origin, control, arrival.destination, CREAM, 0.28, 5.5);
      const head = quadraticPoint(arrival.origin, control, arrival.destination, arrival.progress);
      const tangent = quadraticTangent(arrival.origin, control, arrival.destination, arrival.progress);
      const visible = arrival.kind === 'people' ? Math.max(4, Math.min(10, Math.ceil(arrival.partySize / 5))) : 5;
      for (let member = 0; member < visible; member += 1) {
        const trailT = clamp(arrival.progress - member * 0.012, 0, 1);
        const point = quadraticPoint(arrival.origin, control, arrival.destination, trailT);
        const side = member % 2 ? 1 : -1;
        const length = Math.max(1, Math.hypot(tangent.x, tangent.y));
        const x = point.x - tangent.y / length * side * (member % 3) * 3.2;
        const y = point.y + tangent.x / length * side * (member % 3) * 2;
        const color = hexColor(arrival.palette[member % arrival.palette.length] ?? '#f4c857', SUN);
        this.drawPerson(x, y, color, 1.55, tangent, time + member);
      }
      // A handcart makes the approaching humans read as settlers, not particles.
      if (arrival.kind === 'people') {
        const cart = quadraticPoint(arrival.origin, control, arrival.destination, clamp(arrival.progress - 0.045, 0, 1));
        this.actors.fillStyle(WOOD, 1);
        this.actors.fillRect(cart.x - 8, cart.y - 5, 16, 8);
        this.actors.fillStyle(SUN, 1);
        this.actors.fillTriangle(cart.x - 8, cart.y - 5, cart.x, cart.y - 12, cart.x + 8, cart.y - 5);
        this.actors.fillStyle(INK, 1);
        this.actors.fillCircle(cart.x - 6, cart.y + 4, 3);
        this.actors.fillCircle(cart.x + 6, cart.y + 4, 3);
      }
      this.highlights.lineStyle(2, SUN, 0.72 + Math.sin(time * 2.5) * 0.12);
      this.highlights.strokeEllipse(head.x, head.y, 42, 24);
      this.registerTarget('arrival', arrival.id, head, 28, 0.65);
    });
  }

  private drawPressures(pressures: PressureSite[], time: number): void {
    pressures.forEach((pressure) => {
      const color = pressure.kind === 'scarcity' || pressure.kind === 'extraction' ? CORAL : pressure.kind === 'stagnation' ? VIOLET : 0xd99162;
      const drift = this.reducedMotion ? 0 : Math.sin(time * 0.55 + pressure.seed) * 7;
      // Pressure is weather crossing the land, visibly different from buildings.
      for (let band = 0; band < 4; band += 1) {
        const y = pressure.y - pressure.radius * 0.24 + band * pressure.radius * 0.16;
        const length = pressure.radius * (0.9 + band * 0.2);
        this.world.lineStyle(3 + pressure.severity * 3, color, 0.16 + pressure.severity * 0.2);
        this.world.beginPath();
        this.world.moveTo(pressure.x - length + drift, y);
        this.world.lineTo(pressure.x - length * 0.22 + drift * 0.5, y - 5);
        this.world.lineTo(pressure.x + length * 0.35, y + 4);
        this.world.lineTo(pressure.x + length, y - 2);
        this.world.strokePath();
      }
      const motes = 5 + Math.floor(pressure.severity * 6);
      for (let mote = 0; mote < motes; mote += 1) {
        const x = pressure.x + hashSigned(pressure.seed, 1000 + mote) * pressure.radius + drift;
        const y = pressure.y + hashSigned(pressure.seed, 1040 + mote) * pressure.radius * 0.44;
        this.world.fillStyle(color, 0.45);
        this.world.fillRect(x, y, 4 + mote % 4, 2);
      }
      this.registerTarget('pressure', pressure.id, pressure, pressure.radius, 0.58);
    });
  }

  private drawMemoryTerraces(snapshot: SimulationSnapshot, layout: VisualWorldLayout, time: number): void {
    const lessons = snapshot.lessons.slice(-8);
    if (!lessons.length) return;
    const baseX = layout.bounds.left + 72;
    const baseY = layout.bounds.bottom - 20;
    lessons.forEach((lesson, index) => {
      const x = baseX + index * 18;
      const y = baseY - (index % 2) * 5;
      const selected = lesson.id === this.selectedLessonId;
      this.world.fillStyle(lesson.resolved ? LEAF_DARK : CORAL, 1);
      this.world.fillTriangle(x - 7, y + 4, x, y - 10 - lesson.depth, x + 7, y + 4);
      this.world.fillStyle(CREAM, 0.86);
      this.world.fillCircle(x, y - 2, 2);
      if (selected) {
        this.highlights.lineStyle(2, SUN, 0.88);
        this.highlights.strokeCircle(x, y - 2, 13 + (this.reducedMotion ? 0 : Math.sin(time * 2) * 2));
      }
      this.lessonPositions.set(lesson.id, { x, y: y - 2, radius: 12 });
    });
  }

  private drawLastAction(layout: VisualWorldLayout, time: number): void {
    if (!layout.lastAction) return;
    const action = layout.lastAction;
    const agePhase = this.reducedMotion ? 0.7 : (time * 0.38 + hashUnit(action.seed, 1200)) % 1;
    const color = hexColor(action.color, SUN);
    const point = quadraticPoint(action.origin, midpoint(action.origin, action.destination), action.destination, agePhase);
    this.highlights.fillStyle(color, 0.22);
    this.highlights.fillCircle(point.x, point.y, 7 + action.magnitude * 8);
    this.highlights.lineStyle(2, color, 0.62);
    this.highlights.strokeEllipse(action.destination.x, action.destination.y, 36 + agePhase * 38, 20 + agePhase * 18);
    for (let spark = 0; spark < 6; spark += 1) {
      const angle = spark / 6 * Math.PI * 2 + time * 0.35;
      this.highlights.fillStyle(color, 0.64);
      this.highlights.fillCircle(action.destination.x + Math.cos(angle) * (15 + agePhase * 15), action.destination.y + Math.sin(angle) * (8 + agePhase * 8), 2);
    }
  }

  private drawOutcome(time: number, layout: VisualWorldLayout): void {
    if (!this.outcomeFx) return;
    const elapsed = time - this.outcomeFx.startedAt;
    if (elapsed > 4.2) {
      this.outcomeFx = null;
      return;
    }
    const t = clamp(elapsed / 4.2, 0, 1);
    const color = this.outcomeFx.outcome.kind === 'productive-mistake' ? CORAL : this.outcomeFx.outcome.kind === 'reframe' ? LEAF_LIGHT : SUN;
    const radius = 30 + t * Math.min(layout.bounds.width, layout.bounds.height) * 0.42;
    this.highlights.lineStyle(4 - t * 2.5, color, (1 - t) * 0.65);
    this.highlights.strokeEllipse(layout.commons.x, layout.commons.y, radius * 2, radius * 0.85);
  }

  private drawSelection(time: number): void {
    if (!this.selectedCivicTarget) return;
    const hit = this.civicTargetHits.find((candidate) => candidate.target.kind === this.selectedCivicTarget?.kind && candidate.target.id === this.selectedCivicTarget.id);
    if (!hit) return;
    const pulse = this.reducedMotion ? 0 : Math.sin(time * 3.2) * 4;
    this.highlights.lineStyle(3, SUN, 0.95);
    this.highlights.strokeEllipse(hit.x, hit.y, (hit.radius + pulse) * 2, (hit.radius * hit.scaleY + pulse * 0.5) * 2);
    this.highlights.fillStyle(SUN, 0.8);
    this.highlights.fillTriangle(hit.x - 5, hit.y - hit.radius * hit.scaleY - 9, hit.x + 5, hit.y - hit.radius * hit.scaleY - 9, hit.x, hit.y - hit.radius * hit.scaleY - 3);
  }

  private updateLabels(snapshot: SimulationSnapshot, layout: VisualWorldLayout): void {
    const activeSettlementIds = new Set(layout.settlements.map((settlement) => settlement.id));
    this.settlementLabels.forEach((label, id) => {
      if (!activeSettlementIds.has(id)) {
        label.destroy();
        this.settlementLabels.delete(id);
      }
    });
    layout.settlements.forEach((settlement, settlementIndex) => {
      let label = this.settlementLabels.get(settlement.id);
      if (!label) {
        label = this.add.text(0, 0, '', {
          fontFamily: 'Palatino Linotype, Georgia, serif',
          fontSize: '14px',
          fontStyle: 'bold',
          color: '#fff0c9',
          backgroundColor: 'rgba(16,45,40,0.88)',
          padding: { x: 8, y: 4 },
          shadow: { color: '#102d28', blur: 4, fill: true, offsetX: 0, offsetY: 2 },
        }).setOrigin(0.5, 1).setDepth(10);
        this.settlementLabels.set(settlement.id, label);
      }
      label.setText(`${settlement.name}  ·  ${settlement.inhabitants} people`);
      const side = settlementIndex % 2 === 0 ? 1 : -1;
      label.setPosition(
        settlement.x + side * (settlement.radius * 0.58 + 76),
        settlement.y + 18 + (settlementIndex % 3) * 22,
      );
      label.setVisible(true);
    });

    layout.guilds.forEach((guild) => {
      let label = this.guildLabels.get(guild.voiceId);
      if (!label) {
        label = this.add.text(0, 0, '', {
          fontFamily: 'Cascadia Mono, Consolas, monospace',
          fontSize: '9px',
          fontStyle: 'bold',
          color: guild.color,
          backgroundColor: 'rgba(16,45,40,0.88)',
          padding: { x: 5, y: 3 },
        }).setOrigin(0.5, 1).setDepth(10);
        this.guildLabels.set(guild.voiceId, label);
      }
      const selected = this.selectedVoices.includes(guild.voiceId);
      const hovered = this.hoveredVoice === guild.voiceId;
      label.setText(`${guild.name} · ${guild.activity}`.toUpperCase());
      label.setPosition(guild.x, guild.y - 20);
      label.setVisible(selected || hovered);
    });

    const activeTransient = new Set<string>();
    layout.arrivals.filter((arrival) => !['settled', 'welcomed'].includes(arrival.status)).forEach((arrival) => {
      const key = `arrival-${arrival.id}`;
      activeTransient.add(key);
      let label = this.transientLabels.get(key);
      if (!label) {
        label = this.add.text(0, 0, '', {
          fontFamily: 'Palatino Linotype, Georgia, serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#26362d',
          backgroundColor: 'rgba(244,200,87,0.96)',
          padding: { x: 7, y: 4 },
        }).setOrigin(0.5, 1).setDepth(11);
        this.transientLabels.set(key, label);
      }
      const control = { x: (arrival.origin.x + arrival.destination.x) * 0.5, y: Math.min(arrival.origin.y, arrival.destination.y) - 52 + hashSigned(arrival.seed, 902) * 25 };
      const point = quadraticPoint(arrival.origin, control, arrival.destination, arrival.progress);
      label.setText(arrival.kind === 'people' ? `${arrival.name} · ${arrival.partySize} people approaching` : `${arrival.name} approaching`);
      label.setPosition(point.x, point.y - 22);
      label.setVisible(true);
    });
    const labelledPressures = layout.pressures
      .filter((pressure) => this.selectedCivicTarget?.kind === 'pressure' && this.selectedCivicTarget.id === pressure.id)
      .sort((a, b) => b.severity - a.severity)
      .slice(0, 1);
    labelledPressures.forEach((pressure) => {
      const key = `pressure-${pressure.id}`;
      activeTransient.add(key);
      let label = this.transientLabels.get(key);
      if (!label) {
        label = this.add.text(0, 0, '', {
          fontFamily: 'Cascadia Mono, Consolas, monospace',
          fontSize: '9px',
          fontStyle: 'bold',
          color: '#fff0c9',
          backgroundColor: 'rgba(133,62,48,0.9)',
          padding: { x: 5, y: 3 },
        }).setOrigin(0.5, 1).setDepth(9);
        this.transientLabels.set(key, label);
      }
      label.setText(`${pressure.title.slice(0, 42)}${pressure.title.length > 42 ? '…' : ''}`.toUpperCase());
      label.setPosition(pressure.x, pressure.y - pressure.radius * 0.38);
      label.setVisible(true);
    });
    this.transientLabels.forEach((label, key) => {
      if (!activeTransient.has(key)) {
        label.destroy();
        this.transientLabels.delete(key);
      }
    });

    const action = layout.lastAction;
    const visible = Boolean(action && snapshot.agency.lastAction && snapshot.elapsed - snapshot.agency.lastAction.bornAt < 8);
    this.eventLabel.setVisible(visible);
    if (visible && action) {
      this.eventLabel.setText(snapshot.agency.lastAction?.summary ?? action.verb);
      this.eventLabel.setPosition(action.destination.x, action.destination.y - 35);
    }
  }

  private drawHouse(x: number, y: number, scale: number, roof: number, wall: number, form: SettlementSite['form'], index: number, time: number): void {
    const width = 18 * scale;
    const height = 13 * scale;
    this.world.fillStyle(LAND_SHADOW, 0.42);
    this.world.fillEllipse(x + 3, y + height * 0.75, width * 1.25, height * 0.6);
    if (form === 'walking-village') {
      this.world.lineStyle(2.2 * scale, WOOD, 1);
      this.world.lineBetween(x - width * 0.35, y + height * 0.45, x - width * 0.48, y + height * 0.85);
      this.world.lineBetween(x + width * 0.35, y + height * 0.45, x + width * 0.48, y + height * 0.85);
    }
    this.world.fillStyle(wall, 1);
    this.world.fillRect(x - width * 0.42, y - height * 0.25, width * 0.84, height * 0.83);
    this.world.lineStyle(1, INK, 0.66);
    this.world.strokeRect(x - width * 0.42, y - height * 0.25, width * 0.84, height * 0.83);
    if (form === 'canopy-commons') {
      this.world.fillStyle(roof, 1);
      this.world.fillEllipse(x, y - height * 0.36, width * 1.35, height * 0.78);
      this.world.fillStyle(LEAF_LIGHT, 0.8);
      this.world.fillCircle(x + width * 0.28, y - height * 0.46, height * 0.24);
    } else if (form === 'river-fold') {
      this.world.fillStyle(roof, 1);
      this.world.beginPath();
      this.world.moveTo(x - width * 0.58, y - height * 0.25);
      this.world.lineTo(x - width * 0.12, y - height * 0.82);
      this.world.lineTo(x + width * 0.58, y - height * 0.25);
      this.world.lineTo(x, y - height * 0.47);
      this.world.closePath();
      this.world.fillPath();
    } else if (form === 'threshold-house') {
      this.world.fillStyle(roof, 1);
      this.world.fillRoundedRect(x - width * 0.56, y - height * 0.53, width * 1.12, height * 0.34, 3);
      this.world.fillStyle(SUN, 1);
      this.world.fillCircle(x, y - height * 0.4, 2.4 * scale);
    } else {
      this.world.fillStyle(roof, 1);
      this.world.fillTriangle(x - width * 0.58, y - height * 0.23, x, y - height * 0.86, x + width * 0.58, y - height * 0.23);
    }
    this.world.lineStyle(1.2, CREAM, 0.74);
    this.world.lineBetween(x - width * 0.49, y - height * 0.26, x, y - height * 0.75);
    this.world.lineBetween(x, y - height * 0.75, x + width * 0.49, y - height * 0.26);
    this.world.fillStyle(WOOD, 1);
    this.world.fillRoundedRect(x - width * 0.1, y + height * 0.12, width * 0.2, height * 0.46, 2);
    const glow = this.reducedMotion ? 0.8 : 0.72 + Math.sin(time * 2.3 + index) * 0.18;
    this.highlights.fillStyle(SUN, glow * 0.42);
    this.highlights.fillCircle(x, y + height * 0.23, 2.6 * scale);
  }

  private drawInvention(site: ArtifactSite, scale: number, primary: number, secondary: number, time: number): void {
    const language = `${site.title} ${site.kind} ${site.traits.join(' ')}`.toLowerCase();
    if (language.includes('bridge') || language.includes('crossing')) {
      this.world.lineStyle(7 * scale, primary, 1);
      this.world.lineBetween(site.x - 18 * scale, site.y + 6 * scale, site.x + 18 * scale, site.y - 6 * scale);
      this.world.lineStyle(2, secondary, 0.9);
      for (let slat = -3; slat <= 3; slat += 1) this.world.lineBetween(site.x + slat * 5 * scale, site.y - 2 * scale + slat * -1.4 * scale, site.x + slat * 5 * scale + 3, site.y + 6 * scale + slat * -1.4 * scale);
    } else if (language.includes('water') || language.includes('wheel') || language.includes('river')) {
      const spin = this.reducedMotion ? 0 : time * 0.55;
      this.world.lineStyle(3, primary, 1);
      this.world.strokeCircle(site.x, site.y, 13 * scale);
      for (let spoke = 0; spoke < 8; spoke += 1) {
        const angle = spin + spoke / 8 * Math.PI * 2;
        this.world.lineBetween(site.x, site.y, site.x + Math.cos(angle) * 13 * scale, site.y + Math.sin(angle) * 13 * scale);
      }
      this.world.fillStyle(secondary, 1);
      this.world.fillCircle(site.x, site.y, 4 * scale);
      this.world.lineStyle(4, WATER, 0.8);
      this.world.lineBetween(site.x - 22 * scale, site.y + 12 * scale, site.x + 22 * scale, site.y + 12 * scale);
    } else if (language.includes('wind') || language.includes('air')) {
      this.drawSignalMast(site.x, site.y, 25 * scale, primary, secondary, time);
      const spin = this.reducedMotion ? 0 : time * 0.8;
      for (let blade = 0; blade < 4; blade += 1) {
        const angle = spin + blade * Math.PI / 2;
        this.world.fillStyle(primary, 0.9);
        this.world.fillTriangle(site.x, site.y - 20 * scale, site.x + Math.cos(angle) * 14 * scale, site.y - 20 * scale + Math.sin(angle) * 14 * scale, site.x + Math.cos(angle + 0.45) * 6 * scale, site.y - 20 * scale + Math.sin(angle + 0.45) * 6 * scale);
      }
    } else {
      this.drawWorkshop(site.x, site.y, 22 * scale, primary, secondary, time, site.seed);
    }
  }

  private drawCivicSite(site: ArtifactSite, scale: number, primary: number, secondary: number, time: number): void {
    const kind = `${site.kind} ${site.traits.join(' ')}`.toLowerCase();
    if (kind.includes('garden') || kind.includes('sanctuary')) this.drawGarden(site.x, site.y, 22 * scale, primary, time, site.seed);
    else if (kind.includes('archive')) this.drawArchive(site.x, site.y, 20 * scale, primary);
    else if (kind.includes('workshop')) this.drawWorkshop(site.x, site.y, 21 * scale, primary, secondary, time, site.seed);
    else if (kind.includes('threshold') || kind.includes('crossing')) this.drawThreshold(site.x, site.y, 22 * scale, primary, secondary);
    else this.drawAssemblyCircle(site.x, site.y, 20 * scale, primary, time, site.seed);
  }

  private drawWorkshop(x: number, y: number, size: number, primary: number, secondary: number, time: number, seed: number): void {
    this.world.fillStyle(LAND_SHADOW, 0.42);
    this.world.fillEllipse(x + 3, y + 9, size * 1.65, size * 0.6);
    this.world.fillStyle(secondary, 1);
    this.world.fillRect(x - size * 0.55, y - size * 0.25, size * 1.1, size * 0.72);
    this.world.fillStyle(primary, 1);
    this.world.fillTriangle(x - size * 0.68, y - size * 0.24, x, y - size * 0.78, x + size * 0.68, y - size * 0.24);
    this.world.fillStyle(WOOD, 1);
    this.world.fillRect(x + size * 0.28, y - size * 0.72, size * 0.16, size * 0.42);
    this.world.fillStyle(STONE, 1);
    const smoke = this.reducedMotion ? 0 : Math.sin(time * 0.8 + seed) * 2;
    this.world.fillCircle(x + size * 0.36 + smoke, y - size * 0.86, 3.2);
    this.world.fillCircle(x + size * 0.38 - smoke * 0.4, y - size * 1.04, 2.2);
    this.highlights.fillStyle(SUN, 0.5);
    this.highlights.fillRect(x - size * 0.12, y + size * 0.06, size * 0.24, size * 0.2);
  }

  private drawThreshold(x: number, y: number, size: number, primary: number, secondary: number): void {
    this.world.fillStyle(STONE, 1);
    this.world.fillRoundedRect(x - size * 0.58, y - size * 0.4, size * 0.22, size * 1.05, 2);
    this.world.fillRoundedRect(x + size * 0.36, y - size * 0.4, size * 0.22, size * 1.05, 2);
    this.world.fillStyle(primary, 1);
    this.world.fillRoundedRect(x - size * 0.65, y - size * 0.58, size * 1.3, size * 0.25, 3);
    this.world.fillStyle(secondary, 1);
    this.world.fillCircle(x, y - size * 0.45, size * 0.1);
    this.world.lineStyle(3, PATH, 0.86);
    this.world.lineBetween(x, y + size * 0.62, x, y + size * 1.1);
  }

  private drawFestival(x: number, y: number, size: number, primary: number, secondary: number, time: number, seed: number): void {
    this.world.fillStyle(PATH, 0.74);
    this.world.fillEllipse(x, y + 5, size * 2.1, size * 1.05);
    this.world.lineStyle(2, WOOD, 1);
    this.world.lineBetween(x - size * 0.72, y + size * 0.34, x - size * 0.72, y - size * 0.55);
    this.world.lineBetween(x + size * 0.72, y + size * 0.34, x + size * 0.72, y - size * 0.55);
    this.world.fillStyle(primary, 1);
    this.world.beginPath();
    this.world.moveTo(x - size * 0.9, y - size * 0.48);
    this.world.lineTo(x, y - size * 0.9);
    this.world.lineTo(x + size * 0.9, y - size * 0.48);
    this.world.lineTo(x + size * 0.64, y - size * 0.08);
    this.world.lineTo(x - size * 0.64, y - size * 0.08);
    this.world.closePath();
    this.world.fillPath();
    for (let dancer = 0; dancer < 5; dancer += 1) {
      const angle = dancer / 5 * Math.PI * 2 + (this.reducedMotion ? 0 : time * 0.14);
      this.drawPerson(x + Math.cos(angle) * size * 0.62, y + 8 + Math.sin(angle) * size * 0.28, dancer % 2 ? secondary : primary, 1.22, { x: -Math.sin(angle), y: Math.cos(angle) }, time + seed + dancer);
    }
  }

  private drawAssemblyCircle(x: number, y: number, size: number, primary: number, time: number, seed: number): void {
    this.world.fillStyle(PATH, 0.84);
    this.world.fillEllipse(x, y, size * 2, size * 0.95);
    this.world.lineStyle(2, primary, 0.9);
    this.world.strokeEllipse(x, y, size * 2, size * 0.95);
    for (let seat = 0; seat < 7; seat += 1) {
      const angle = seat / 7 * Math.PI * 2;
      this.world.fillStyle(seat % 2 ? WOOD : primary, 1);
      this.world.fillEllipse(x + Math.cos(angle) * size * 0.73, y + Math.sin(angle) * size * 0.34, 6, 4);
    }
    const pulse = this.reducedMotion ? 0 : Math.sin(time + seed) * 1.5;
    this.highlights.fillStyle(SUN, 0.22);
    this.highlights.fillCircle(x, y, 5 + pulse);
  }

  private drawGarden(x: number, y: number, size: number, primary: number, time: number, seed: number): void {
    this.world.fillStyle(SOIL, 0.78);
    this.world.fillEllipse(x, y + 4, size * 2, size * 0.95);
    this.world.lineStyle(2, PATH, 0.8);
    this.world.strokeEllipse(x, y + 4, size * 2, size * 0.95);
    for (let plant = 0; plant < 9; plant += 1) {
      const angle = hashUnit(seed, 1400 + plant) * Math.PI * 2;
      const distance = hashUnit(seed, 1440 + plant) * size * 0.72;
      this.drawPlant(this.world, x + Math.cos(angle) * distance, y + 4 + Math.sin(angle) * distance * 0.42, 5 + plant % 3, plant % 3 === 0 ? primary : LEAF_LIGHT, time + plant);
    }
  }

  private drawArchive(x: number, y: number, size: number, primary: number): void {
    this.world.fillStyle(STONE, 1);
    this.world.fillRect(x - size * 0.62, y - size * 0.25, size * 1.24, size * 0.85);
    this.world.fillStyle(primary, 1);
    this.world.fillTriangle(x - size * 0.75, y - size * 0.25, x, y - size * 0.75, x + size * 0.75, y - size * 0.25);
    this.world.fillStyle(DEEP_INK, 1);
    this.world.fillRoundedRect(x - size * 0.13, y + size * 0.08, size * 0.26, size * 0.52, 2);
    this.world.lineStyle(1.2, CREAM, 0.9);
    for (let line = 0; line < 3; line += 1) this.world.lineBetween(x - size * 0.44, y - size * 0.05 + line * 5, x - size * 0.2, y - size * 0.05 + line * 5);
  }

  private drawSignalMast(x: number, y: number, size: number, primary: number, secondary: number, time: number): void {
    this.world.lineStyle(3, WOOD, 1);
    this.world.lineBetween(x, y + size * 0.55, x, y - size * 0.72);
    const wave = this.reducedMotion ? 0 : Math.sin(time * 2) * 3;
    this.world.fillStyle(primary, 1);
    this.world.beginPath();
    this.world.moveTo(x, y - size * 0.7);
    this.world.lineTo(x + size * 0.68 + wave, y - size * 0.52);
    this.world.lineTo(x + size * 0.16, y - size * 0.29);
    this.world.closePath();
    this.world.fillPath();
    this.world.fillStyle(secondary, 1);
    this.world.fillCircle(x, y - size * 0.72, 3);
    this.highlights.lineStyle(2, primary, 0.25);
    this.highlights.strokeCircle(x, y - size * 0.72, size * 0.42 + Math.sin(time * 1.4) * 2);
  }

  private drawScaffold(x: number, y: number, size: number, progress: number, time: number, seed: number): void {
    const height = size * (0.55 + progress * 0.55);
    this.actors.lineStyle(2, WOOD, 0.92);
    this.actors.lineBetween(x - size * 0.62, y + size * 0.42, x - size * 0.48, y - height);
    this.actors.lineBetween(x + size * 0.62, y + size * 0.42, x + size * 0.48, y - height);
    for (let rail = 0; rail < 3; rail += 1) {
      const yy = y + size * 0.3 - rail * height * 0.42;
      this.actors.lineBetween(x - size * 0.58, yy, x + size * 0.58, yy);
    }
    this.actors.lineStyle(1, CREAM, 0.7);
    this.actors.lineBetween(x - size * 0.48, y - height, x + size * 0.62, y + size * 0.42);
    const workerX = x - size * 0.7 + (this.reducedMotion ? 0 : (Math.sin(time * 1.3 + seed) + 1) * size * 0.15);
    this.drawPerson(workerX, y + size * 0.48, SUN, 1.3, { x: 1, y: 0 }, time);
    this.actors.fillStyle(WOOD, 1);
    this.actors.fillRect(workerX - 7, y + size * 0.34, 15, 2.5);
  }

  private drawTree(graphics: Phaser.GameObjects.Graphics, tree: TreeSite): void {
    const size = tree.size;
    const leaf = tree.vitality > 0.62 ? LEAF_LIGHT : tree.vitality > 0.34 ? LEAF : 0x7b8250;
    if (tree.kind === 'reed') {
      graphics.lineStyle(1.4, LEAF_DARK, 0.9);
      for (let reed = -2; reed <= 2; reed += 1) graphics.lineBetween(tree.x + reed * 2, tree.y + size * 0.5, tree.x + reed, tree.y - size * (0.6 + Math.abs(reed) * 0.08));
      return;
    }
    graphics.fillStyle(LAND_SHADOW, 0.22);
    graphics.fillEllipse(tree.x + 2, tree.y + size * 0.72, size * 1.6, size * 0.5);
    graphics.lineStyle(Math.max(1.5, size * 0.22), WOOD, 1);
    graphics.lineBetween(tree.x, tree.y + size * 0.55, tree.x + hashSigned(tree.seed, 2) * 1.2, tree.y - size * 0.34);
    graphics.fillStyle(leaf, 1);
    graphics.fillCircle(tree.x, tree.y - size * 0.48, size * 0.68);
    graphics.fillCircle(tree.x - size * 0.5, tree.y - size * 0.2, size * 0.52);
    graphics.fillCircle(tree.x + size * 0.52, tree.y - size * 0.18, size * 0.56);
    graphics.fillStyle(LAND_LIGHT, 0.55);
    graphics.fillCircle(tree.x - size * 0.2, tree.y - size * 0.65, size * 0.19);
    if (tree.kind === 'fruit') {
      graphics.fillStyle(CORAL, 1);
      graphics.fillCircle(tree.x - size * 0.38, tree.y - size * 0.25, 1.6);
      graphics.fillCircle(tree.x + size * 0.34, tree.y - size * 0.36, 1.6);
      graphics.fillCircle(tree.x, tree.y - size * 0.72, 1.6);
    }
  }

  private drawGroundRock(x: number, y: number, size: number, seed: number): void {
    this.ground.fillStyle(STONE, 0.82);
    this.ground.beginPath();
    this.ground.moveTo(x - size, y + size * 0.4);
    this.ground.lineTo(x - size * 0.42, y - size * (0.65 + hashUnit(seed, 1) * 0.3));
    this.ground.lineTo(x + size * 0.35, y - size * 0.76);
    this.ground.lineTo(x + size, y + size * 0.4);
    this.ground.closePath();
    this.ground.fillPath();
    this.ground.lineStyle(1, CREAM, 0.45);
    this.ground.lineBetween(x - size * 0.42, y - size * 0.62, x + size * 0.35, y - size * 0.7);
  }

  private drawPerson(x: number, y: number, clothing: number, scale: number, direction: WorldPoint, time: number): void {
    const length = Math.max(0.001, Math.hypot(direction.x, direction.y));
    const dx = direction.x / length;
    const dy = direction.y / length;
    const px = -dy;
    const py = dx;
    const stride = this.reducedMotion ? 0 : Math.sin(time * 6.2) * 1.45 * scale;
    // Bold shadows and pale heads keep human silhouettes readable at 1x.
    this.actors.fillStyle(LAND_SHADOW, 0.28);
    this.actors.fillEllipse(x + 1.5, y + 6 * scale, 7 * scale, 3 * scale);
    this.actors.fillStyle(CREAM, 1);
    this.actors.fillCircle(x, y - 5.2 * scale, 2.25 * scale);
    this.actors.fillStyle(clothing, 1);
    this.actors.fillTriangle(x - 2.5 * scale, y - 2.8 * scale, x + 2.5 * scale, y - 2.8 * scale, x + dx * 1.2 * scale, y + 3.5 * scale);
    this.actors.lineStyle(Math.max(1.4, 1.25 * scale), INK, 0.95);
    this.actors.lineBetween(x, y + 2.4 * scale, x + px * stride - dx * scale, y + 6 * scale + py * stride * 0.35);
    this.actors.lineBetween(x, y + 2.4 * scale, x - px * stride - dx * scale, y + 6 * scale - py * stride * 0.35);
    this.actors.lineBetween(x, y - 1 * scale, x + px * 3 * scale, y + py * 2 * scale);
    this.actors.lineBetween(x, y - 1 * scale, x - px * 3 * scale, y - py * 2 * scale);
  }

  private drawPlant(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number, color: number, time: number): void {
    const sway = this.reducedMotion ? 0 : Math.sin(time * 0.8) * size * 0.12;
    graphics.lineStyle(1.2, LEAF_DARK, 0.94);
    graphics.lineBetween(x, y + size * 0.55, x + sway, y - size * 0.45);
    graphics.fillStyle(color, 1);
    graphics.fillEllipse(x - size * 0.38, y - size * 0.1, size * 0.65, size * 0.34);
    graphics.fillEllipse(x + size * 0.42, y - size * 0.3, size * 0.68, size * 0.35);
  }

  private lockCamera(layout: VisualWorldLayout): void {
    const camera = this.cameras.main;
    // Layout is generated in viewport coordinates, so this is a deterministic
    // auto-fit on every load (including hydrated v1 worlds).
    camera.setBounds(0, 0, layout.width, layout.height);
    camera.setZoom(1);
    camera.setScroll(0, 0);
    camera.centerOn(layout.width / 2, layout.height / 2);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    const voice = this.hitVoice(pointer.worldX, pointer.worldY);
    const civic = this.hitCivicTarget(pointer.worldX, pointer.worldY);
    if (voice !== this.hoveredVoice) {
      this.hoveredVoice = voice;
      this.onHoverVoice?.(voice, voice ? { x: pointer.x, y: pointer.y } : undefined);
    } else if (voice) {
      this.onHoverVoice?.(voice, { x: pointer.x, y: pointer.y });
    }
    this.onHoverCivicTarget?.(civic, civic ? { x: pointer.x, y: pointer.y } : undefined);
    this.game.canvas.style.cursor = voice || civic || this.hitLesson(pointer.worldX, pointer.worldY) ? 'pointer' : 'default';
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    const civic = this.hitCivicTarget(pointer.worldX, pointer.worldY);
    if (civic && civic.kind !== 'voice') {
      this.onCivicTargetSelected?.(civic);
      return;
    }
    const voice = this.hitVoice(pointer.worldX, pointer.worldY);
    if (voice) {
      this.onVoiceSelected?.(voice);
      return;
    }
    const lesson = this.hitLesson(pointer.worldX, pointer.worldY);
    if (lesson) this.onLessonSelected?.(lesson);
    else if (civic) this.onCivicTargetSelected?.(civic);
  }

  private hitVoice(x: number, y: number): VoiceId | null {
    for (const [id, point] of this.voicePositions) {
      const dx = (x - point.x) / point.radius;
      const dy = (y - point.y) / (point.radius * 0.72);
      if (dx * dx + dy * dy <= 1) return id;
    }
    return null;
  }

  private hitLesson(x: number, y: number): string | null {
    for (const [id, point] of this.lessonPositions) if (Math.hypot(x - point.x, y - point.y) <= point.radius) return id;
    return null;
  }

  private hitCivicTarget(x: number, y: number): CivicTargetRef | null {
    return this.civicTargetHits.filter((hit) => {
      const dx = (x - hit.x) / Math.max(1, hit.radius);
      const dy = (y - hit.y) / Math.max(1, hit.radius * hit.scaleY);
      return dx * dx + dy * dy <= 1;
    }).sort((a, b) => a.radius - b.radius)[0]?.target ?? null;
  }

  private registerTarget(kind: CivicTargetKind, id: string, point: WorldPoint, radius: number, scaleY: number, secondaryId?: string): void {
    if (!this.layout) return;
    this.civicTargetHits.push({
      x: point.x,
      y: point.y,
      radius,
      scaleY,
      target: {
        kind,
        id,
        ...(secondaryId ? { secondaryId } : {}),
        position: {
          x: clamp(point.x / Math.max(1, this.layout.width), 0, 1),
          y: clamp(point.y / Math.max(1, this.layout.height), 0, 1),
        },
      },
    });
  }

  private agencySignature(snapshot: SimulationSnapshot): string {
    const agency = snapshot.agency;
    const collectionSignature = [
      agency.regions.map((item) => `${item.id}:${item.vitality.toFixed(2)}:${item.pressure.toFixed(2)}`).join(','),
      agency.settlements.map((item) => `${item.id}:${item.revision}:${item.inhabitants}:${item.maturity.toFixed(2)}`).join(','),
      agency.inventions.map((item) => `${item.id}:${item.revision}:${item.maturity.toFixed(2)}`).join(','),
      agency.charterLaws.map((item) => `${item.id}:${item.revision}:${item.strength.toFixed(2)}`).join(','),
      agency.cultures.map((item) => `${item.id}:${item.revision}:${item.adoption.toFixed(2)}`).join(','),
      agency.sites.map((item) => `${item.id}:${item.revision}:${item.intensity.toFixed(2)}`).join(','),
      agency.pressures.map((item) => `${item.id}:${item.state}:${item.severity.toFixed(2)}:${item.position.x.toFixed(2)}:${item.position.y.toFixed(2)}`).join(','),
      agency.arrivals.map((item) => `${item.id}:${item.revision}:${item.status}:${Math.floor(item.timeToArrival)}:${item.partySize}`).join(','),
      agency.lastAction?.id ?? '',
      snapshot.works.length,
      snapshot.lessons.length,
    ];
    return collectionSignature.join('|');
  }

  private drawOrganicFill(graphics: Phaser.GameObjects.Graphics, cx: number, cy: number, rx: number, ry: number, seed: number, wobble: number): void {
    graphics.beginPath();
    const segments = 58;
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = segment / segments * Math.PI * 2;
      const noise = Math.sin(angle * 3 + seed * 0.013) * wobble * 0.5 + Math.cos(angle * 7 - seed * 0.009) * wobble * 0.28;
      const x = cx + Math.cos(angle) * (rx + noise);
      const y = cy + Math.sin(angle) * (ry + noise * 0.55);
      if (segment === 0) graphics.moveTo(x, y);
      else graphics.lineTo(x, y);
    }
    graphics.closePath();
    graphics.fillPath();
  }

  private drawOrganicStroke(graphics: Phaser.GameObjects.Graphics, cx: number, cy: number, rx: number, ry: number, seed: number, wobble: number): void {
    graphics.beginPath();
    const segments = 58;
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = segment / segments * Math.PI * 2;
      const noise = Math.sin(angle * 3 + seed * 0.013) * wobble * 0.5 + Math.cos(angle * 7 - seed * 0.009) * wobble * 0.28;
      const x = cx + Math.cos(angle) * (rx + noise);
      const y = cy + Math.sin(angle) * (ry + noise * 0.55);
      if (segment === 0) graphics.moveTo(x, y);
      else graphics.lineTo(x, y);
    }
    graphics.closePath();
    graphics.strokePath();
  }

  private strokeQuadratic(graphics: Phaser.GameObjects.Graphics, start: WorldPoint, control: WorldPoint, end: WorldPoint, color: number, alpha: number, width: number): void {
    graphics.lineStyle(width, color, alpha);
    graphics.beginPath();
    graphics.moveTo(start.x, start.y);
    for (let step = 1; step <= 24; step += 1) {
      const point = quadraticPoint(start, control, end, step / 24);
      graphics.lineTo(point.x, point.y);
    }
    graphics.strokePath();
  }

  private strokePolyline(graphics: Phaser.GameObjects.Graphics, points: WorldPoint[], color: number, alpha: number, width: number): void {
    if (points.length < 2) return;
    graphics.lineStyle(width, color, alpha);
    graphics.beginPath();
    graphics.moveTo(points[0]!.x, points[0]!.y);
    for (let index = 1; index < points.length; index += 1) graphics.lineTo(points[index]!.x, points[index]!.y);
    graphics.strokePath();
  }
}

function quadraticPoint(start: WorldPoint, control: WorldPoint, end: WorldPoint, t: number): WorldPoint {
  const one = 1 - t;
  return {
    x: one * one * start.x + 2 * one * t * control.x + t * t * end.x,
    y: one * one * start.y + 2 * one * t * control.y + t * t * end.y,
  };
}

function quadraticTangent(start: WorldPoint, control: WorldPoint, end: WorldPoint, t: number): WorldPoint {
  return {
    x: 2 * (1 - t) * (control.x - start.x) + 2 * t * (end.x - control.x),
    y: 2 * (1 - t) * (control.y - start.y) + 2 * t * (end.y - control.y),
  };
}

function midpoint(a: WorldPoint, b: WorldPoint): WorldPoint {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
}

function hexColor(value: string, fallback: number): number {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return fallback;
  return Number.parseInt(value.slice(1), 16);
}
