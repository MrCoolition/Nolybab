import type { NanoCivicDirection, NanoCivicOption, NanoStatus } from '../ai/NanoGamemasterClient';
import { NanoGamemasterClient } from '../ai/NanoGamemasterClient';
import type { LivingSoundscape } from '../audio/LivingSoundscape';
import type { NolybabScene } from '../rendering/NolybabScene';
import { DIRECTOR_BY_ID, QUALITY_META, VOICES, VOICE_BY_ID } from '../simulation/content';
import type { NolybabSimulation } from '../simulation/NolybabSimulation';
import { QUALITY_KEYS } from '../simulation/types';
import type {
  CivicActionAffordance,
  CivicActionInput,
  CivicActionPreview,
  CivicActionResult,
  CivicDomain,
  CivicMethod,
  CivicPhase,
  CivicProposal,
  CivicTargetRef,
  CivicVerb,
  DirectorId,
  ProposalMode,
  SimulationSnapshot,
  SpatialPoint,
  VoiceId,
  WeaveOutcome,
} from '../simulation/types';

function must<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required interface element #${id}`);
  return element as T;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function modeLabel(mode: ProposalMode): string {
  if (mode === 'shared-minimum') return 'Shared minimum';
  if (mode === 'carry-difference') return 'Carry difference';
  return 'Reversible trial';
}

function workLabel(kind: string): string {
  return kind.replaceAll('-', ' ');
}

const DOMAIN_META: Record<CivicDomain, { label: string; creates: string; color: string }> = {
  law: { label: 'Law', creates: 'a contestable living law', color: '#efc45a' },
  culture: { label: 'Culture', creates: 'a practice people can mutate', color: '#b997d8' },
  invention: { label: 'Invention', creates: 'a working civic invention', color: '#69b8e8' },
  habitat: { label: 'Build', creates: 'a settlement or shared site', color: '#91b66b' },
};

const VERB_LABELS: Record<CivicVerb, string> = {
  seed: 'Seed',
  bind: 'Bind',
  shelter: 'Shelter',
  translate: 'Translate',
  reroute: 'Reroute',
  invite: 'Invite',
  amend: 'Amend',
  compost: 'Compost',
  refuse: 'Refuse',
};

const DEFAULT_VERBS: CivicVerb[] = ['seed', 'bind', 'shelter', 'translate', 'reroute', 'invite', 'amend', 'compost', 'refuse'];

function targetKey(target: CivicTargetRef): string {
  return `${target.kind}:${target.id}${target.secondaryId ? `:${target.secondaryId}` : ''}`;
}

function formatResourceCost(cost: { attention: number; trust: number; vitality: number; possibility: number }): string {
  const labels = [
    ['attention', cost.attention],
    ['trust', cost.trust],
    ['vitality', cost.vitality],
    ['possibility', cost.possibility],
  ] as const;
  const used = labels.filter(([, value]) => value > 0.001);
  return used.length ? used.map(([label, value]) => `${Math.ceil(value)} ${label}`).join(' · ') : 'no immediate resource cost';
}

function finitePoint(value: unknown): SpatialPoint | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const point = value as { x?: unknown; y?: unknown };
  return typeof point.x === 'number' && Number.isFinite(point.x) && typeof point.y === 'number' && Number.isFinite(point.y)
    ? { x: point.x, y: point.y }
    : undefined;
}

const PHASES: CivicPhase[] = ['pressure', 'council', 'decision', 'action', 'growth'];
type CommandTargetOption = { target: CivicTargetRef; label: string; meta: string; urgent?: boolean };

export class NolybabHud {
  private readonly simulation: NolybabSimulation;
  private readonly scene: NolybabScene;
  private readonly soundscape: LivingSoundscape;
  private readonly nano: NanoGamemasterClient;
  private selectedVoices: VoiceId[] = [];
  private selectedLessonId: string | null = null;
  private latestSnapshot: SimulationSnapshot;
  private lastCivicPhase: CivicPhase;
  private resultTimer = 0;
  private lastSelectionKey = '';
  private lastMemoryKey = '';
  private lastDirectorKey = '';
  private lastNanoQuestionId: string | null = null;
  private hasEntered = false;
  private nanoState: NanoStatus = 'quiet';
  private selectedDomain: CivicDomain = 'law';
  private selectedVerb: CivicVerb = 'seed';
  private selectedMethod: CivicMethod = 'prototype';
  private selectedIntensity: 1 | 2 | 3 = 2;
  private selectedTarget: CivicTargetRef | null = null;
  private targetRefs = new Map<string, CivicTargetRef>();
  private actionAffordances: CivicActionAffordance[] = [];
  private actionPreview: CivicActionPreview | null = null;
  private lastAgencyKey = '';
  private reshapeArmed = false;
  private foreseeTimer = 0;
  private lastForeseeKey = '';
  private nanoForecast: Record<string, unknown> | null = null;
  private latestNanoDirection: NanoCivicDirection | null = null;
  private arrivalNanoDirection: NanoCivicDirection | null = null;
  private selectedNanoOption: NanoCivicOption | null = null;
  private authorStep: 0 | 1 | 2 | 3 | 4 = 0;
  private authorMode: 'choices' | 'option' | 'custom' = 'choices';

  private readonly arrival = must<HTMLElement>('arrival');
  private readonly seedInput = must<HTMLInputElement>('seed-phrase');
  private readonly beginButton = must<HTMLButtonElement>('begin-button');
  private readonly continueButton = must<HTMLButtonElement>('continue-button');
  private readonly questionTitle = must<HTMLElement>('question-title');
  private readonly questionSituation = must<HTMLElement>('question-situation');
  private readonly questionPrompt = must<HTMLElement>('question-prompt');
  private readonly questionOrigin = must<HTMLElement>('question-origin');
  private readonly directorSigil = must<HTMLElement>('director-sigil');
  private readonly pulseClock = must<HTMLElement>('pulse-clock');
  private readonly epochLabel = must<HTMLElement>('epoch-label');
  private readonly qualityList = must<HTMLElement>('quality-list');
  private readonly knotGlyph = must<HTMLElement>('knot-glyph');
  private readonly voiceDock = must<HTMLElement>('voice-dock');
  private readonly cycleSteps = must<HTMLOListElement>('cycle-steps');
  private readonly stageInstruction = must<HTMLElement>('stage-instruction');
  private readonly selectedVoicesElement = must<HTMLElement>('selected-voices');
  private readonly voiceRoster = must<HTMLElement>('voice-roster');
  private readonly proposalList = must<HTMLElement>('proposal-list');
  private readonly weaveButton = must<HTMLButtonElement>('weave-button');
  private readonly commandDomain = must<HTMLElement>('command-domain');
  private readonly commandTargets = must<HTMLElement>('command-targets');
  private readonly commandVerbs = must<HTMLElement>('command-verbs');
  private readonly commandMethod = must<HTMLSelectElement>('command-method');
  private readonly commandIntensity = must<HTMLElement>('command-intensity');
  private readonly actionName = must<HTMLInputElement>('action-name');
  private readonly interruptButton = must<HTMLButtonElement>('interrupt-button');
  private readonly reshapeButton = must<HTMLButtonElement>('reshape-button');
  private readonly previewTarget = must<HTMLElement>('preview-target');
  private readonly previewTitle = must<HTMLElement>('preview-title');
  private readonly previewCreates = must<HTMLElement>('preview-creates');
  private readonly previewChanges = must<HTMLElement>('preview-changes');
  private readonly previewRisk = must<HTMLElement>('preview-risk');
  private readonly commandFeedback = must<HTMLElement>('command-feedback');
  private readonly lessonChip = must<HTMLButtonElement>('lesson-chip');
  private readonly nanoStatus = must<HTMLElement>('nano-status');
  private readonly aiDisclosure = must<HTMLElement>('ai-disclosure');
  private readonly aiDisclosureCopy = must<HTMLElement>('ai-disclosure-copy');
  private readonly activeDirectorCount = must<HTMLElement>('active-director-count');
  private readonly memoryCount = must<HTMLElement>('memory-count');
  private readonly lessonList = must<HTMLElement>('lesson-list');
  private readonly historyList = must<HTMLElement>('history-list');
  private readonly directorList = must<HTMLElement>('director-list');
  private readonly knobList = must<HTMLElement>('knob-list');
  private readonly pauseButton = must<HTMLButtonElement>('pause-button');
  private readonly speedButton = must<HTMLButtonElement>('speed-button');
  private readonly soundButton = must<HTMLButtonElement>('sound-button');
  private readonly resultToast = must<HTMLElement>('result-toast');
  private readonly resultKind = must<HTMLElement>('result-kind');
  private readonly resultTitle = must<HTMLElement>('result-title');
  private readonly resultCopy = must<HTMLElement>('result-copy');
  private readonly resultDelta = must<HTMLElement>('result-delta');
  private readonly resultWord = must<HTMLElement>('result-word');
  private readonly hoverNote = must<HTMLElement>('hover-note');
  private readonly populationStat = must<HTMLElement>('stat-population');
  private readonly settlementsStat = must<HTMLElement>('stat-settlements');
  private readonly lawsStat = must<HTMLElement>('stat-laws');
  private readonly culturesStat = must<HTMLElement>('stat-cultures');
  private readonly inventionsStat = must<HTMLElement>('stat-inventions');
  private readonly resourceAttention = must<HTMLElement>('resource-attention');
  private readonly resourceTrust = must<HTMLElement>('resource-trust');
  private readonly resourceVitality = must<HTMLElement>('resource-vitality');
  private readonly resourcePossibility = must<HTMLElement>('resource-possibility');
  private readonly humanArrivalPanel = must<HTMLElement>('human-arrival-panel');
  private readonly arrivalPeople = must<HTMLElement>('arrival-people');
  private readonly arrivalName = must<HTMLElement>('arrival-name');
  private readonly arrivalDescription = must<HTMLElement>('arrival-description');
  private readonly arrivalNeeds = must<HTMLElement>('arrival-needs');
  private readonly arrivalEta = must<HTMLElement>('arrival-eta');
  private readonly nanoOptions = must<HTMLElement>('nano-options');
  private readonly nanoChoiceStage = must<HTMLElement>('nano-choice-stage');
  private readonly authorToggle = must<HTMLButtonElement>('author-toggle');
  private readonly authorPanel = must<HTMLElement>('author-panel');
  private readonly authorClose = must<HTMLButtonElement>('author-close');
  private readonly authorSteps = must<HTMLElement>('author-steps');
  private readonly authorPrevious = must<HTMLButtonElement>('author-prev');
  private readonly authorNext = must<HTMLButtonElement>('author-next');
  private readonly authorStepHelp = must<HTMLElement>('author-step-help');
  private readonly authorNavigation = must<HTMLElement>('author-navigation');
  private readonly chosenOption = must<HTMLElement>('chosen-option');
  private readonly chosenOptionTitle = must<HTMLElement>('chosen-option-title');
  private readonly chosenOptionCopy = must<HTMLElement>('chosen-option-copy');

  constructor(
    simulation: NolybabSimulation,
    scene: NolybabScene,
    soundscape: LivingSoundscape,
    nano: NanoGamemasterClient,
    hasSavedWorld: boolean,
  ) {
    this.simulation = simulation;
    this.scene = scene;
    this.soundscape = soundscape;
    this.nano = nano;
    this.latestSnapshot = simulation.snapshot;
    this.lastCivicPhase = simulation.snapshot.civicPhase;
    this.bindWorldCallbacks();
    this.bindControls();

    if (hasSavedWorld) {
      this.continueButton.hidden = false;
      this.continueButton.textContent = `Return to “${simulation.snapshot.seedPhrase}”`;
      this.seedInput.placeholder = 'or name a different surviving truth…';
    }

    nano.subscribe((status) => {
      this.nanoState = status;
      this.renderNanoStatus();
    });
    simulation.subscribe((snapshot) => {
      const enteredNewPressure = snapshot.civicPhase === 'pressure' && this.lastCivicPhase !== 'pressure';
      this.lastCivicPhase = snapshot.civicPhase;
      this.latestSnapshot = snapshot;
      if (enteredNewPressure) {
        if (this.selectedTarget?.kind === 'pressure') this.selectedTarget = null;
        this.nanoForecast = null;
        this.lastForeseeKey = '';
      }
      this.syncCouncilSelection(snapshot);
      this.render(snapshot);
      this.soundscape.adapt(snapshot);
      this.maybeEnrichCouncil(snapshot);
    });
    simulation.onOutcome((outcome) => {
      this.selectedLessonId = null;
      this.scene.setSelectedLesson(null);
      this.scene.playOutcome(outcome);
      this.soundscape.outcome(outcome);
      this.showOutcome(outcome);
    });
  }

  private bindWorldCallbacks(): void {
    this.scene.onVoiceSelected = (voice) => this.toggleVoice(voice);
    this.scene.onLessonSelected = (lessonId) => this.selectLesson(lessonId);
    this.scene.onHoverVoice = (voice, point) => this.showVoiceHover(voice, point);
    this.scene.onCivicTargetSelected = (target) => {
      if (this.reshapeArmed) this.commitReshape(target);
      else {
        this.selectedTarget = target;
        this.scene.setSelectedCivicTarget(target);
        this.nanoForecast = null;
        this.lastForeseeKey = '';
        this.renderAgency(this.latestSnapshot, true);
        if (this.authorMode === 'custom' && this.authorStep === 1) this.renderAuthoring();
      }
    };
    this.scene.onHoverCivicTarget = (target, point) => this.showCivicTargetHover(target, point);
  }

  private bindControls(): void {
    this.beginButton.addEventListener('click', () => void this.beginNewWorld());
    this.continueButton.addEventListener('click', () => void this.enterWorld());
    this.seedInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void this.beginNewWorld();
    });
    this.weaveButton.addEventListener('click', () => this.executeCommand());
    this.nanoOptions.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-nano-option]');
      const localButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-local-domain]');
      if (localButton?.dataset.localDomain) {
        this.selectedDomain = localButton.dataset.localDomain as CivicDomain;
        this.openAuthoring();
        this.setAuthorStep(1);
        this.renderAgency(this.latestSnapshot, true);
        return;
      }
      const index = Number(button?.dataset.nanoOption);
      if (!button || !Number.isInteger(index)) return;
      this.chooseNanoOption(index);
    });
    this.authorToggle.addEventListener('click', () => this.openAuthoring());
    this.authorClose.addEventListener('click', () => this.closeAuthoring());
    this.authorSteps.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-author-step]');
      const step = Number(button?.dataset.authorStep);
      if (!button || step < 0 || step > 4) return;
      this.setAuthorStep(step as 0 | 1 | 2 | 3 | 4);
    });
    this.authorPrevious.addEventListener('click', () => this.setAuthorStep(Math.max(0, this.authorStep - 1) as 0 | 1 | 2 | 3 | 4));
    this.authorNext.addEventListener('click', () => {
      if (this.authorStep === 4) {
        this.executeCommand();
        return;
      }
      this.setAuthorStep(Math.min(4, this.authorStep + 1) as 0 | 1 | 2 | 3 | 4);
    });
    this.commandDomain.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-domain]');
      const domain = button?.dataset.domain as CivicDomain | undefined;
      if (!domain || !(domain in DOMAIN_META)) return;
      this.selectedDomain = domain;
      this.selectedNanoOption = null;
      this.nanoForecast = null;
      this.lastForeseeKey = '';
      this.renderAgency(this.latestSnapshot, true);
    });
    this.commandTargets.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-target-key]');
      const target = button?.dataset.targetKey ? this.targetRefs.get(button.dataset.targetKey) : undefined;
      if (!target) return;
      if (this.reshapeArmed) {
        this.commitReshape(target);
        return;
      }
      this.selectedTarget = target;
      this.scene.setSelectedCivicTarget(target);
      this.nanoForecast = null;
      this.lastForeseeKey = '';
      this.renderAgency(this.latestSnapshot, true);
      if (this.authorMode === 'custom' && this.authorStep === 1) this.renderAuthoring();
    });
    this.commandVerbs.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-verb]');
      const verb = button?.dataset.verb as CivicVerb | undefined;
      if (!verb || !DEFAULT_VERBS.includes(verb) || button?.disabled) return;
      this.selectedVerb = verb;
      this.selectedNanoOption = null;
      this.nanoForecast = null;
      this.lastForeseeKey = '';
      this.renderAgency(this.latestSnapshot, true);
    });
    this.commandMethod.addEventListener('change', () => {
      this.selectedMethod = this.commandMethod.value as CivicMethod;
      this.nanoForecast = null;
      this.lastForeseeKey = '';
      this.renderAgency(this.latestSnapshot, true);
    });
    this.commandIntensity.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-intensity]');
      const intensity = Number(button?.dataset.intensity);
      if (intensity !== 1 && intensity !== 2 && intensity !== 3) return;
      this.selectedIntensity = intensity;
      this.renderAgency(this.latestSnapshot, true);
    });
    this.actionName.addEventListener('input', () => this.renderAgency(this.latestSnapshot, true));
    this.interruptButton.addEventListener('click', () => this.interruptWorld());
    this.reshapeButton.addEventListener('click', () => this.toggleReshape());
    window.addEventListener('nolybab:nano-response', (event) => this.receiveNanoResponse(event));
    this.lessonChip.addEventListener('click', () => this.selectLesson(this.selectedLessonId ?? ''));
    this.selectedVoicesElement.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-selected-voice]');
      if (target?.dataset.selectedVoice) this.toggleVoice(target.dataset.selectedVoice as VoiceId);
    });

    this.voiceRoster.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-voice-id]');
      if (target?.dataset.voiceId) this.toggleVoice(target.dataset.voiceId as VoiceId);
    });
    this.proposalList.addEventListener('click', (event) => {
      const release = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-release-council]');
      if (release) {
        this.releaseCouncil();
        return;
      }
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-proposal-id]');
      if (target?.dataset.proposalId) this.simulation.chooseProposal(target.dataset.proposalId);
    });

    this.pauseButton.addEventListener('click', () => this.simulation.setPaused(!this.latestSnapshot.paused));
    this.speedButton.addEventListener('click', () => {
      const next = this.latestSnapshot.speed === 1 ? 2 : this.latestSnapshot.speed === 2 ? 4 : 1;
      this.simulation.setSpeed(next);
    });
    this.soundButton.addEventListener('click', async () => {
      const enabled = await this.soundscape.toggle();
      this.renderSoundButton(enabled);
    });

    this.bindDrawerButton('memory-button', 'memory-drawer');
    this.bindDrawerButton('directors-button', 'directors-drawer');
    this.bindDrawerButton('codex-button', 'codex-drawer');
    document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((button) => {
      button.addEventListener('click', () => this.closeDrawer(button.dataset.close ?? ''));
    });

    this.bindGuideTabs();
    must<HTMLButtonElement>('knot-toggle').addEventListener('click', (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      this.qualityList.classList.toggle('is-open', !expanded);
    });

    this.lessonList.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-lesson-id]');
      if (target?.dataset.lessonId) this.selectLesson(target.dataset.lessonId);
    });
    this.directorList.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-challenge-director]');
      const id = target?.dataset.challengeDirector as DirectorId | undefined;
      if (!target || !id) return;
      if (this.simulation.challengeDirector(id)) {
        target.textContent = 'framing opened';
        target.disabled = true;
      }
    });

    must<HTMLButtonElement>('new-seed-button').addEventListener('click', () => {
      if (!window.confirm('Begin another Nolybab? The current world remains until the new surviving truth is committed.')) return;
      this.simulation.setPaused(true);
      this.hasEntered = false;
      this.releaseLocalSelection();
      this.seedInput.value = '';
      this.continueButton.hidden = false;
      this.continueButton.textContent = `Return to “${this.simulation.snapshot.seedPhrase}”`;
      this.arrival.removeAttribute('aria-hidden');
      this.arrival.classList.remove('is-gone');
      this.seedInput.focus();
    });

    document.addEventListener('pointermove', (event) => {
      if (!(event.target instanceof HTMLCanvasElement)) this.showVoiceHover(null);
    }, { passive: true });
    window.addEventListener('keydown', (event) => this.handleKeyboard(event));
  }

  private bindGuideTabs(): void {
    const tabs = [
      ['guide-play-tab', 'guide-play'],
      ['guide-world-tab', 'guide-world'],
      ['guide-premise-tab', 'guide-premise'],
    ] as const;
    tabs.forEach(([tabId, panelId]) => {
      must<HTMLButtonElement>(tabId).addEventListener('click', () => {
        tabs.forEach(([candidateTab, candidatePanel]) => {
          const active = candidateTab === tabId;
          const button = must<HTMLButtonElement>(candidateTab);
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-selected', String(active));
          must<HTMLElement>(candidatePanel).hidden = !active;
        });
        must<HTMLElement>(panelId).focus({ preventScroll: true });
      });
    });
  }

  private bindDrawerButton(buttonId: string, drawerId: string): void {
    const button = must<HTMLButtonElement>(buttonId);
    button.addEventListener('click', () => {
      const drawer = must<HTMLElement>(drawerId);
      const willOpen = !drawer.classList.contains('is-open');
      document.querySelectorAll<HTMLElement>('.side-drawer.is-open').forEach((open) => this.closeDrawer(open.id));
      drawer.classList.toggle('is-open', willOpen);
      drawer.setAttribute('aria-hidden', String(!willOpen));
      drawer.inert = !willOpen;
      button.setAttribute('aria-expanded', String(willOpen));
      if (willOpen) drawer.querySelector<HTMLElement>('.drawer-close')?.focus({ preventScroll: true });
    });
  }

  private closeDrawer(drawerId: string): void {
    if (!drawerId) return;
    const drawer = document.getElementById(drawerId);
    if (!drawer) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.inert = true;
    const trigger = document.querySelector<HTMLButtonElement>(`[aria-controls="${drawerId}"]`);
    trigger?.setAttribute('aria-expanded', 'false');
    trigger?.focus({ preventScroll: true });
  }

  private openAuthoring(): void {
    this.authorMode = 'custom';
    this.selectedNanoOption = null;
    this.authorStep = 0;
    this.authorToggle.setAttribute('aria-expanded', 'true');
    this.renderAuthoring();
  }

  private closeAuthoring(): void {
    this.authorMode = 'choices';
    this.selectedNanoOption = null;
    this.authorToggle.setAttribute('aria-expanded', 'false');
    this.renderAuthoring();
    this.renderNanoChoices();
  }

  private setAuthorStep(step: 0 | 1 | 2 | 3 | 4): void {
    this.authorStep = step;
    this.renderAuthoring();
    if (step === 4) this.renderAgency(this.latestSnapshot, true);
  }

  private chooseNanoOption(index: number): void {
    const option = this.latestNanoDirection?.options[index];
    if (!option) return;
    this.selectedNanoOption = option;
    this.selectedDomain = option.domain;
    this.selectedVerb = option.verb;
    this.selectedMethod = option.method;
    this.selectedIntensity = 2;
    this.actionName.value = option.title;

    const leadByDomain: Record<CivicDomain, VoiceId> = {
      law: 'guardians',
      culture: 'cultivators',
      invention: 'innovators',
      habitat: 'ecostewards',
    };
    this.selectedVoices = [leadByDomain[option.domain]];
    if (option.verb === 'bind') this.selectedVoices.push(option.domain === 'invention' ? 'pioneers' : 'mountaineers');

    const targetPriority: Record<CivicDomain, CivicTargetRef['kind'][]> = {
      habitat: ['arrival', 'settlement', 'region', 'commons', 'pressure'],
      culture: ['arrival', 'settlement', 'culture', 'commons', 'pressure'],
      invention: ['settlement', 'region', 'pressure', 'commons', 'invention'],
      law: ['pressure', 'settlement', 'region', 'commons', 'law'],
    };
    const candidates = this.collectCommandTargets(this.latestSnapshot, false).sort((a, b) => {
      const rank = targetPriority[option.domain];
      return rank.indexOf(a.target.kind) - rank.indexOf(b.target.kind);
    });
    this.selectedTarget = candidates.find(({ target }) => this.simulation.getActionAffordances(target).some((affordance) =>
      affordance.verb === option.verb && affordance.available && affordance.domains.includes(option.domain),
    ))?.target ?? candidates[0]?.target ?? { kind: 'commons', id: 'commons' };

    this.scene.setSelectedVoices(this.selectedVoices);
    this.scene.setSelectedCivicTarget(this.selectedTarget);
    this.nanoForecast = this.latestNanoDirection as unknown as Record<string, unknown>;
    this.authorMode = 'option';
    this.authorStep = 4;
    this.renderSelection(this.latestSnapshot);
    this.renderAgency(this.latestSnapshot, true);
    this.renderAuthoring();
  }

  private renderAuthoring(): void {
    const isOpen = this.authorMode !== 'choices';
    this.voiceDock.dataset.mode = this.authorMode;
    this.nanoChoiceStage.hidden = isOpen;
    this.authorPanel.hidden = !isOpen;
    this.authorToggle.setAttribute('aria-expanded', String(isOpen));
    const isOption = this.authorMode === 'option';
    this.chosenOption.hidden = !isOption;
    this.authorSteps.hidden = isOption;
    this.authorNavigation.hidden = isOption;
    if (isOption && this.selectedNanoOption) {
      this.chosenOptionTitle.textContent = this.selectedNanoOption.title;
      this.chosenOptionCopy.textContent = `${this.selectedNanoOption.promise} Risk: ${this.selectedNanoOption.risk}`;
    }
    this.authorPanel.querySelectorAll<HTMLElement>('[data-author-page]').forEach((page) => {
      const pageStep = Number(page.dataset.authorPage);
      page.hidden = isOption ? pageStep !== 4 : pageStep !== this.authorStep;
    });
    this.authorSteps.querySelectorAll<HTMLButtonElement>('[data-author-step]').forEach((button) => {
      const active = Number(button.dataset.authorStep) === this.authorStep;
      if (active) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    this.authorPrevious.disabled = this.authorStep === 0;
    const nextLabels = ['Next: place it', 'Next: choose people', 'Next: choose method', 'Next: review', 'Commit this future'];
    const help = [
      'Choose what you want to create.',
      this.selectedTarget ? 'A place is selected. You can also touch the map.' : 'Choose a place, arrival, settlement, pressure, or region.',
      this.selectedVoices[0] ? `${VOICE_BY_ID[this.selectedVoices[0]].shortName} will lead.` : 'Choose the culture that will lead.',
      `${VERB_LABELS[this.selectedVerb]} through ${this.selectedMethod}.`,
      this.actionPreview?.valid ? 'The world is ready. Read the cost, then commit.' : this.actionPreview?.errors[0] ?? 'Complete the missing parts.',
    ];
    this.authorNext.textContent = nextLabels[this.authorStep] ?? 'Next';
    this.authorNext.disabled = this.authorStep === 4 && !this.actionPreview?.valid;
    this.authorStepHelp.textContent = help[this.authorStep] ?? '';
  }

  private renderNanoChoices(): void {
    if (this.authorMode !== 'choices') return;
    const direction = this.latestNanoDirection;
    if (direction?.options?.length === 3) {
      const palette = direction.visualDirection?.palette ?? ['#efc45a', '#69b8e8', '#91b66b', '#b997d8'];
      this.nanoOptions.innerHTML = direction.options.map((option, index) => `<button class="nano-option" type="button" data-nano-option="${index}" style="--option-color:${escapeHtml(palette[index % palette.length] ?? '#efc45a')}">
        <span class="nano-option-top"><i>${escapeHtml(option.domain)}</i><em>${escapeHtml(option.verb)} · ${escapeHtml(option.method)}</em></span>
        <strong>${escapeHtml(option.title)}</strong>
        <p>${escapeHtml(option.promise)}</p>
        <small><b>Tradeoff</b> ${escapeHtml(option.risk)}</small>
        <span class="option-visual">${escapeHtml(option.visualHook)}</span>
        <span class="option-choose">Choose this future <b>→</b></span>
      </button>`).join('');
      return;
    }
    if (this.nanoState === 'fallback') {
      const pressure = this.activePressure(this.latestSnapshot);
      const human = this.latestSnapshot.agency.arrivals.find((arrival) => arrival.kind === 'people' && arrival.status === 'approaching');
      const local = [
        { domain: 'habitat' as CivicDomain, verb: 'shelter' as CivicVerb, method: 'reciprocity' as CivicMethod, target: human?.name ?? 'the arriving people' },
        { domain: 'law' as CivicDomain, verb: 'refuse' as CivicVerb, method: 'boundary' as CivicMethod, target: pressure?.title ?? 'the nearest pressure' },
        { domain: 'invention' as CivicDomain, verb: 'seed' as CivicVerb, method: 'prototype' as CivicMethod, target: this.latestSnapshot.agency.settlements.at(-1)?.name ?? 'the first camp' },
      ];
      this.nanoOptions.innerHTML = local.map((item) => `<button class="nano-option is-local" type="button" data-local-domain="${item.domain}"><span class="nano-option-top"><i>${item.domain}</i><em>local safety net</em></span><strong>${VERB_LABELS[item.verb]} ${escapeHtml(item.target)}</strong><p>${escapeHtml(DOMAIN_META[item.domain].creates)}</p><span class="option-visual">Nano will replace this as soon as it reconnects.</span></button>`).join('');
    }
  }

  private async beginNewWorld(): Promise<void> {
    const phrase = this.seedInput.value.trim();
    if (!phrase) {
      this.seedInput.classList.add('needs-answer');
      this.seedInput.focus();
      window.setTimeout(() => this.seedInput.classList.remove('needs-answer'), 650);
      return;
    }
    this.nano.cancel();
    this.lastNanoQuestionId = null;
    this.latestNanoDirection = null;
    this.arrivalNanoDirection = null;
    this.selectedNanoOption = null;
    this.authorMode = 'choices';
    this.authorStep = 0;
    this.selectedTarget = null;
    this.scene.setSelectedCivicTarget(null);
    this.nanoForecast = null;
    this.lastForeseeKey = '';
    this.simulation.reseed(phrase);
    this.releaseLocalSelection();
    this.renderAuthoring();
    this.renderNanoChoices();
    await this.enterWorld();
  }

  private async enterWorld(): Promise<void> {
    this.hasEntered = true;
    this.arrival.classList.add('is-gone');
    this.simulation.setPaused(false);
    window.dispatchEvent(new CustomEvent('nolybab:nano-request', {
      detail: { kind: 'arrival', snapshot: this.simulation.snapshot },
    }));
    this.renderNanoChoices();
    const enabled = await this.soundscape.setEnabled(true);
    this.renderSoundButton(enabled);
    window.setTimeout(() => this.arrival.setAttribute('aria-hidden', 'true'), 900);
  }

  private toggleVoice(voice: VoiceId): void {
    const existing = this.selectedVoices.indexOf(voice);
    if (existing >= 0) this.selectedVoices.splice(existing, 1);
    else if (this.selectedVoices.length < 2) this.selectedVoices.push(voice);
    else this.selectedVoices = [this.selectedVoices[1] as VoiceId, voice];

    this.scene.setSelectedVoices(this.selectedVoices);
    this.soundscape.voice(voice);
    this.renderSelection(this.latestSnapshot);
    this.nanoForecast = null;
    this.lastForeseeKey = '';
    this.renderAgency(this.latestSnapshot, true);
  }

  private conveneSelected(): void {
    if (this.selectedVoices.length !== 2 || this.latestSnapshot.civicPhase !== 'pressure') return;
    const pair = [this.selectedVoices[0] as VoiceId, this.selectedVoices[1] as VoiceId] as [VoiceId, VoiceId];
    this.simulation.conveneCouncil(pair, this.selectedLessonId ?? undefined, false);
  }

  private releaseCouncil(): void {
    this.nano.cancel();
    this.lastNanoQuestionId = null;
    this.simulation.cancelCouncil();
    this.releaseLocalSelection();
  }

  private releaseLocalSelection(): void {
    this.selectedVoices = [];
    this.selectedLessonId = null;
    this.scene.setSelectedVoices([]);
    this.scene.setSelectedLesson(null);
    this.renderSelection(this.simulation.snapshot);
  }

  private selectLesson(lessonId: string): void {
    if (this.latestSnapshot.civicPhase === 'action' || this.latestSnapshot.civicPhase === 'growth') return;
    const lesson = this.latestSnapshot.lessons.find((candidate) => candidate.id === lessonId && !candidate.resolved);
    this.selectedLessonId = lesson && this.selectedLessonId !== lessonId ? lessonId : null;
    this.scene.setSelectedLesson(this.selectedLessonId);
    this.renderSelection(this.latestSnapshot);
    this.renderMemory(this.latestSnapshot, true);
    if (this.selectedLessonId) this.closeDrawer('memory-drawer');
  }

  private advanceCouncil(): void {
    const snapshot = this.simulation.snapshot;
    if (snapshot.civicPhase === 'pressure') {
      this.conveneSelected();
      return;
    }
    if (snapshot.civicPhase !== 'decision' || !snapshot.council?.selectedProposalId) return;
    this.simulation.enactCouncil();
  }

  private buildActionInput(target = this.selectedTarget): CivicActionInput | null {
    const lead = this.selectedVoices[0];
    if (!lead || !target) return null;
    const authoredName = this.actionName.value.trim();
    return {
      domain: this.selectedDomain,
      verb: this.selectedVerb,
      method: this.selectedMethod,
      target,
      lead,
      ally: this.selectedVoices[1],
      intensity: this.selectedIntensity,
      lessonId: this.selectedLessonId ?? undefined,
      authoredName: authoredName || undefined,
      destination: this.selectedDomain === 'habitat' ? target.position : undefined,
    };
  }

  private executeCommand(): void {
    if (this.reshapeArmed) {
      this.setCommandFeedback('Choose a destination in the Target lane, or cancel Reshape.');
      return;
    }
    const input = this.buildActionInput();
    if (!input) {
      this.setCommandFeedback(this.selectedVoices[0] ? 'Choose where this action should land.' : 'Choose a lead culture first.');
      return;
    }
    const preview = this.simulation.previewCivicAction(input);
    if (!preview.valid) {
      this.setCommandFeedback(preview.errors[0] ?? 'That action is not possible here yet.');
      this.renderAgency(this.latestSnapshot, true);
      return;
    }
    const result = this.simulation.performCivicAction(input);
    if (!result) {
      this.setCommandFeedback('The world is physically changing. Hold it for a breath, then act again.');
      return;
    }
    this.showCivicConsequence(result);
    this.actionName.value = '';
    this.nanoForecast = null;
    this.lastForeseeKey = '';
    this.setCommandFeedback(result.summary, 'success');
    this.authorMode = 'choices';
    this.selectedNanoOption = null;
    this.latestNanoDirection = null;
    this.renderAuthoring();
    this.renderNanoChoices();
    window.dispatchEvent(new CustomEvent('nolybab:nano-request', {
      detail: { kind: 'consequence', snapshot: this.simulation.snapshot, input, result },
    }));
    this.renderAgency(this.simulation.snapshot, true);
  }

  private interruptWorld(): void {
    const pressure = this.activePressure(this.latestSnapshot);
    if (!pressure) {
      this.setCommandFeedback('No autonomous pressure is currently moving.');
      return;
    }
    const interrupted = this.simulation.interruptAutonomy(pressure.id);
    this.setCommandFeedback(
      interrupted ? `${pressure.title} is held. The world will wait for your move.` : 'That pressure has already crossed the threshold.',
      interrupted ? 'success' : 'warning',
    );
    this.renderAgency(this.simulation.snapshot, true);
  }

  private toggleReshape(): void {
    if (this.reshapeArmed) {
      this.reshapeArmed = false;
      this.reshapeButton.setAttribute('aria-pressed', 'false');
      this.setCommandFeedback('Reshape cancelled.');
      this.renderAgency(this.latestSnapshot, true);
      return;
    }
    if (!this.selectedVoices[0]) {
      this.setCommandFeedback('Choose the culture that will carry the pressure first.');
      return;
    }
    const pressure = this.activePressure(this.latestSnapshot);
    if (!pressure) {
      this.setCommandFeedback('There is no live pressure to reroute.');
      return;
    }
    this.reshapeArmed = true;
    this.reshapeButton.setAttribute('aria-pressed', 'true');
    this.setCommandFeedback(`Choose where “${pressure.title}” should move.`);
    this.renderAgency(this.latestSnapshot, true);
  }

  private commitReshape(destination: CivicTargetRef): void {
    const pressure = this.activePressure(this.latestSnapshot);
    const lead = this.selectedVoices[0];
    const point = destination.position;
    if (!pressure || !lead || !point) {
      this.setCommandFeedback('That destination cannot receive a pressure. Choose a region, settlement, or site.');
      return;
    }
    const result = this.simulation.reshapePressure(pressure.id, point, lead);
    if (!result) {
      this.setCommandFeedback('The pressure resisted that route. The forecast shows what is missing.', 'warning');
      return;
    }
    this.reshapeArmed = false;
    this.reshapeButton.setAttribute('aria-pressed', 'false');
    this.selectedTarget = destination;
    this.setCommandFeedback(result.summary, 'success');
    this.showCivicConsequence(result);
    this.authorMode = 'choices';
    this.selectedNanoOption = null;
    this.latestNanoDirection = null;
    this.renderAuthoring();
    this.renderNanoChoices();
    window.dispatchEvent(new CustomEvent('nolybab:nano-request', {
      detail: { kind: 'consequence', snapshot: this.simulation.snapshot, input: result.input, result },
    }));
    this.renderAgency(this.simulation.snapshot, true);
  }

  private activePressure(snapshot: SimulationSnapshot) {
    if (this.selectedTarget?.kind === 'pressure') {
      const selected = snapshot.agency.pressures.find((pressure) => pressure.id === this.selectedTarget?.id && pressure.state !== 'transformed');
      if (selected) return selected;
    }
    return snapshot.agency.pressures
      .filter((pressure) => pressure.state === 'active' || pressure.state === 'emerging')
      .sort((a, b) => a.timeToBreach - b.timeToBreach || b.severity - a.severity)[0];
  }

  private setCommandFeedback(message: string, kind: 'quiet' | 'success' | 'warning' = 'quiet'): void {
    this.commandFeedback.textContent = message;
    this.commandFeedback.dataset.kind = kind;
  }

  private receiveNanoResponse(event: Event): void {
    const detail = (event as CustomEvent).detail as {
      kind?: string;
      direction?: Record<string, unknown> | null;
      input?: CivicActionInput;
      result?: CivicActionResult;
    } | undefined;
    if (!detail?.direction || typeof detail.direction !== 'object') return;
    const direction = detail.direction as unknown as NanoCivicDirection;
    if (detail.kind === 'arrival') this.arrivalNanoDirection = direction;
    if (Array.isArray(direction.options) && direction.options.length === 3) {
      this.latestNanoDirection = direction;
      if (this.authorMode === 'choices') this.renderNanoChoices();
    }
    if (detail.kind === 'foresee') {
      const current = this.buildActionInput();
      if (!current || !detail.input || targetKey(current.target) !== targetKey(detail.input.target) || current.domain !== detail.input.domain || current.lead !== detail.input.lead) return;
      this.nanoForecast = detail.direction;
      this.renderAgency(this.latestSnapshot, true);
      return;
    }
    const worldLine = typeof detail.direction.worldLine === 'string' ? detail.direction.worldLine : '';
    if (detail.kind === 'arrival' && worldLine) {
      this.questionPrompt.textContent = worldLine;
      this.setCommandFeedback(worldLine);
      this.renderHumanArrival(this.simulation.snapshot);
    } else if (detail.kind === 'consequence' && worldLine) {
      this.setCommandFeedback(worldLine, 'success');
      this.resultCopy.textContent = direction.consequence || worldLine;
      this.resultDelta.textContent = direction.dissent ? `Dissent remains: ${direction.dissent}` : this.resultDelta.textContent;
      this.resultWord.innerHTML = `<strong>${escapeHtml(direction.publicName || direction.title)}</strong><span>${escapeHtml(direction.worldLine)}</span>`;
      this.resultToast.classList.add('is-visible');
      this.resultToast.setAttribute('aria-hidden', 'false');
    }
  }

  private maybeEnrichCouncil(snapshot: SimulationSnapshot): void {
    const council = snapshot.council;
    const question = snapshot.currentQuestion;
    if (!council || !question || (snapshot.civicPhase !== 'council' && snapshot.civicPhase !== 'decision')) return;
    if (this.lastNanoQuestionId === question.id) return;
    this.lastNanoQuestionId = question.id;
    void this.nano.convene(snapshot, council.authors).then((direction) => {
      if (!direction) return;
      this.simulation.applyNanoDirection(question.id, direction);
    });
  }

  private syncCouncilSelection(snapshot: SimulationSnapshot): void {
    const council = snapshot.council;
    if (!council || snapshot.civicPhase === 'pressure') return;
    if (council.lessonId && !this.selectedLessonId) {
      this.selectedLessonId = council.lessonId;
      this.scene.setSelectedLesson(council.lessonId);
    }
  }

  private render(snapshot: SimulationSnapshot): void {
    this.renderCivilizationStatus(snapshot);
    this.renderHumanArrival(snapshot);
    this.renderQuestion(snapshot);
    this.renderPhase(snapshot);
    this.renderQualities(snapshot);
    this.renderSelection(snapshot);
    this.renderAgency(snapshot);
    this.renderControls(snapshot);
    this.renderMemory(snapshot);
    this.renderDirectors(snapshot);
    this.renderAuthoring();
  }

  private renderCivilizationStatus(snapshot: SimulationSnapshot): void {
    const agency = snapshot.agency;
    const population = agency.civilization?.population
      ?? agency.settlements.reduce((sum, settlement) => sum + settlement.inhabitants, 0);
    this.populationStat.textContent = population.toLocaleString();
    this.settlementsStat.textContent = String(agency.settlements.length);
    this.lawsStat.textContent = String(agency.charterLaws.length);
    this.culturesStat.textContent = String(agency.cultures.length);
    this.inventionsStat.textContent = String(agency.inventions.length);
    this.resourceAttention.textContent = String(Math.floor(agency.resources.attention));
    this.resourceTrust.textContent = String(Math.floor(agency.resources.trust));
    this.resourceVitality.textContent = String(Math.floor(agency.resources.vitality));
    this.resourcePossibility.textContent = String(Math.floor(agency.resources.possibility));
  }

  private renderHumanArrival(snapshot: SimulationSnapshot): void {
    const humans = snapshot.agency.arrivals.filter((arrival) => arrival.kind === 'people');
    const arrival = humans.find((candidate) => candidate.status === 'approaching')
      ?? humans.slice().reverse().find((candidate) => candidate.status === 'settled' || candidate.status === 'welcomed')
      ?? humans.at(-1);
    if (!arrival) {
      this.humanArrivalPanel.hidden = true;
      return;
    }
    this.humanArrivalPanel.hidden = false;
    const thread = arrival.status === 'approaching' ? this.arrivalNanoDirection?.humanThread : undefined;
    this.arrivalPeople.textContent = String(arrival.partySize);
    this.arrivalName.textContent = thread?.communityName || arrival.name;
    this.arrivalDescription.textContent = thread?.originMemory || arrival.description;
    const needs = thread?.needs?.length ? thread.needs : arrival.needs.map((need) => QUALITY_META[need]?.label ?? need);
    const skills = thread?.skills?.slice(0, 2) ?? [];
    this.arrivalNeeds.innerHTML = [
      ...needs.map((need) => `<span class="is-need">needs ${escapeHtml(need)}</span>`),
      ...skills.map((skill) => `<span class="is-skill">brings ${escapeHtml(skill)}</span>`),
    ].join('');
    this.arrivalEta.textContent = arrival.status === 'approaching'
      ? `${Math.max(0, Math.ceil(arrival.timeToArrival))}s`
      : arrival.status;
    this.humanArrivalPanel.dataset.status = arrival.status;
  }

  private renderQuestion(snapshot: SimulationSnapshot): void {
    const question = snapshot.currentQuestion;
    this.epochLabel.textContent = `${snapshot.epochName} epoch · pulse ${snapshot.cycle} · ${snapshot.works.length + snapshot.archivedWorkCount} civic works`;
    const pressure = this.activePressure(snapshot);
    if (pressure && (pressure.state === 'active' || pressure.state === 'emerging')) {
      this.questionOrigin.textContent = `${pressure.kind} front · generation ${pressure.generation}`;
      this.questionTitle.textContent = pressure.title;
      this.questionSituation.textContent = pressure.detail;
      this.questionPrompt.textContent = snapshot.agency.nanoWorldLines[pressure.id]
        ?? 'Choose a target and author the response. The forecast updates before you commit.';
      this.pulseClock.textContent = `${Math.max(0, Math.ceil(pressure.timeToBreach))}s to breach`;
      this.directorSigil.style.background = QUALITY_META[pressure.focus].color;
      return;
    }
    if (!question) {
      const work = snapshot.council?.pendingWork ?? snapshot.works.at(-1);
      this.questionOrigin.textContent = snapshot.civicPhase === 'action' ? 'Council action · a choice becomes material' : 'Living consequence · the world remembers';
      this.questionTitle.textContent = work?.title ?? 'Meaning is moving through the Commons';
      this.questionSituation.textContent = work?.summary ?? 'Relationships, memory, and future possibilities are changing together.';
      this.questionPrompt.textContent = snapshot.civicPhase === 'action'
        ? 'Watch the civic work cross from decision into consequence.'
        : snapshot.council?.worldLine ?? 'The next pressure will inherit what happened here.';
      this.pulseClock.textContent = `${Math.ceil(snapshot.actionSeconds)}s`;
      this.directorSigil.style.background = snapshot.civicPhase === 'action' ? '#efc45a' : '#91b66b';
      return;
    }

    const director = DIRECTOR_BY_ID[question.director];
    this.questionOrigin.textContent = `${director.name} · ${director.epithet}`;
    this.questionTitle.textContent = question.title;
    this.questionSituation.textContent = question.situation;
    this.questionPrompt.textContent = snapshot.council?.worldLine ?? question.prompt;
    const seconds = Math.ceil(snapshot.council?.phaseSeconds ?? question.secondsLeft);
    this.pulseClock.textContent = snapshot.civicPhase === 'pressure'
      ? `world acts in ${seconds}s`
      : snapshot.civicPhase === 'council'
        ? `council ${seconds}s`
        : `decision ${seconds}s`;
    this.directorSigil.style.background = director.color;
  }

  private renderPhase(snapshot: SimulationSnapshot): void {
    const current = PHASES.indexOf(snapshot.civicPhase);
    this.voiceDock.dataset.phase = snapshot.civicPhase;
    this.cycleSteps.querySelectorAll<HTMLElement>('[data-phase]').forEach((step, index) => {
      step.classList.toggle('is-active', index === current);
      step.classList.toggle('is-past', index < current);
    });

    const lead = this.selectedVoices[0] ? VOICE_BY_ID[this.selectedVoices[0]] : null;
    if (this.reshapeArmed) this.stageInstruction.textContent = 'Choose a destination on the map. This pressure will physically move there.';
    else if (this.authorMode === 'choices') this.stageInstruction.textContent = this.latestNanoDirection?.title ?? 'Three genuinely different futures are being composed from the live world.';
    else if (this.authorMode === 'option') this.stageInstruction.textContent = 'Review the cost and consequence. You make the final call.';
    else if (!lead) this.stageInstruction.textContent = 'Choose the culture that will lead this action.';
    else if (!this.selectedTarget) this.stageInstruction.textContent = `${lead.shortName} are ready. Choose where their action lands.`;
    else this.stageInstruction.textContent = `${DOMAIN_META[this.selectedDomain].label}: ${VERB_LABELS[this.selectedVerb].toLowerCase()} through ${this.selectedMethod}.`;
  }

  private renderQualities(snapshot: SimulationSnapshot): void {
    QUALITY_KEYS.map((quality) => snapshot.qualities[quality]).slice(0, 4).forEach((value, index) => {
      (this.knotGlyph.children.item(index) as HTMLElement | null)?.style.setProperty('--vital', String(value));
    });
    this.qualityList.innerHTML = QUALITY_KEYS.map((quality) => {
      const meta = QUALITY_META[quality];
      const value = snapshot.qualities[quality];
      return `<div class="quality-row" title="${escapeHtml(meta.description)}">
        <span><i style="--quality-color:${meta.color}"></i>${escapeHtml(meta.label)}</span>
        <b>${percent(value)}</b><em style="--quality-color:${meta.color};--quality-value:${value}"></em>
      </div>`;
    }).join('');
  }

  private renderAgency(snapshot: SimulationSnapshot, force = false): void {
    const options = this.collectCommandTargets(snapshot, this.reshapeArmed);
    const availableKeys = new Set(options.map((option) => targetKey(option.target)));
    if (!this.reshapeArmed && (!this.selectedTarget || !availableKeys.has(targetKey(this.selectedTarget)))) {
      this.selectedTarget = options[0]?.target ?? { kind: 'commons', id: 'commons' };
      this.scene.setSelectedCivicTarget(this.selectedTarget);
    }

    const resources = snapshot.agency.resources;
    const agencyKey = [
      snapshot.civicPhase,
      this.selectedDomain,
      this.selectedVerb,
      this.selectedMethod,
      this.selectedIntensity,
      this.selectedVoices.join(':'),
      this.selectedTarget ? targetKey(this.selectedTarget) : '',
      this.selectedLessonId ?? '',
      this.reshapeArmed,
      this.actionName.value,
      resources.attention.toFixed(1),
      resources.trust.toFixed(1),
      resources.vitality.toFixed(1),
      resources.possibility.toFixed(1),
      options.map((option) => `${targetKey(option.target)}:${option.meta}`).join('|'),
      this.nanoForecast ? JSON.stringify(this.nanoForecast) : '',
    ].join('~');
    if (!force && agencyKey === this.lastAgencyKey) return;
    this.lastAgencyKey = agencyKey;

    this.voiceDock.style.setProperty('--command-color', DOMAIN_META[this.selectedDomain].color);
    this.commandDomain.querySelectorAll<HTMLButtonElement>('[data-domain]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.domain === this.selectedDomain));
    });
    this.commandIntensity.querySelectorAll<HTMLButtonElement>('[data-intensity]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.intensity) === this.selectedIntensity));
    });
    this.commandMethod.value = this.selectedMethod;

    this.targetRefs.clear();
    this.commandTargets.innerHTML = options.map((option) => {
      const key = targetKey(option.target);
      this.targetRefs.set(key, option.target);
      const selected = !this.reshapeArmed && this.selectedTarget ? key === targetKey(this.selectedTarget) : false;
      return `<button type="button" role="option" data-target-key="${escapeHtml(key)}" aria-selected="${selected}" class="${option.urgent ? 'is-urgent' : ''}"><span>${escapeHtml(option.label)}</span><small>${escapeHtml(option.meta)}</small></button>`;
    }).join('');

    const affordanceTarget = this.reshapeArmed ? undefined : this.selectedTarget ?? undefined;
    this.actionAffordances = this.simulation.getActionAffordances(affordanceTarget);
    const relevant = this.actionAffordances.filter((affordance) =>
      affordance.domains.includes(this.selectedDomain)
      && (!this.selectedTarget || affordance.targetKinds.includes(this.selectedTarget.kind)),
    );
    if (!relevant.some((affordance) => affordance.verb === this.selectedVerb && affordance.available)) {
      this.selectedVerb = relevant.find((affordance) => affordance.available)?.verb ?? relevant[0]?.verb ?? this.selectedVerb;
    }
    this.commandVerbs.innerHTML = relevant.map((affordance) => `<button type="button" data-verb="${affordance.verb}" aria-pressed="${affordance.verb === this.selectedVerb}" ${affordance.available ? '' : 'disabled'} title="${escapeHtml(affordance.available ? affordance.description : affordance.reason ?? 'Unavailable here')}"><span>${escapeHtml(affordance.label || VERB_LABELS[affordance.verb])}</span><small>${escapeHtml(affordance.description)}</small></button>`).join('')
      || '<span class="no-affordance">Choose another target for this kind of change.</span>';

    const input = this.reshapeArmed ? null : this.buildActionInput();
    this.actionPreview = input ? this.simulation.previewCivicAction(input) : null;
    this.renderActionPreview(this.actionPreview, input);
    this.renderPhase(snapshot);
    this.renderAuthoring();
    if (input) this.requestNanoForecast(snapshot, input);

    const pressure = this.activePressure(snapshot);
    this.interruptButton.disabled = !pressure;
    this.interruptButton.textContent = pressure ? `Interrupt · ${Math.max(0, Math.ceil(pressure.timeToBreach))}s` : 'No pressure to interrupt';
    this.reshapeButton.disabled = !pressure || !this.selectedVoices[0];
    this.reshapeButton.textContent = this.reshapeArmed ? 'Cancel reshape' : 'Reshape pressure';
  }

  private collectCommandTargets(snapshot: SimulationSnapshot, destinationOnly: boolean): CommandTargetOption[] {
    const seen = new Set<string>();
    const options: CommandTargetOption[] = [];
    const add = (target: CivicTargetRef, label: string, meta: string, urgent = false) => {
      const key = targetKey(target);
      if (seen.has(key)) return;
      seen.add(key);
      options.push({ target, label, meta, urgent });
    };
    const agency = snapshot.agency;

    if (!destinationOnly) {
      agency.pressures
        .filter((pressure) => pressure.state === 'active' || pressure.state === 'emerging')
        .sort((a, b) => a.timeToBreach - b.timeToBreach || b.severity - a.severity)
        .slice(0, 3)
        .forEach((pressure) => add(
          { kind: 'pressure', id: pressure.id, position: pressure.position },
          pressure.title,
          `${pressure.kind} · ${Math.max(0, Math.ceil(pressure.timeToBreach))}s`,
          pressure.timeToBreach < 30 || pressure.severity > 0.7,
        ));

      if (this.selectedDomain === 'culture' || this.selectedDomain === 'habitat') {
        agency.arrivals
          .filter((arrival) => arrival.status === 'approaching')
          .sort((a, b) => a.timeToArrival - b.timeToArrival)
          .slice(0, 3)
          .forEach((arrival) => add(
            { kind: 'arrival', id: arrival.id, position: arrival.destination },
            arrival.name,
            `${arrival.kind} arriving · ${Math.max(0, Math.ceil(arrival.timeToArrival))}s`,
            arrival.urgency > 0.7,
          ));
      }

      if (this.selectedDomain === 'law') {
        agency.charterLaws.slice(-3).reverse().forEach((law) => add({ kind: 'law', id: law.id, position: law.position }, law.name, `${law.amendments} amendments`));
      } else if (this.selectedDomain === 'culture') {
        agency.cultures.slice(-3).reverse().forEach((culture) => add({ kind: 'culture', id: culture.id, position: culture.position }, culture.name, `${Math.round(culture.adoption * 100)}% adoption`));
      } else if (this.selectedDomain === 'invention') {
        agency.inventions.slice(-3).reverse().forEach((invention) => add({ kind: 'invention', id: invention.id, position: invention.position }, invention.name, `${Math.round(invention.reliability * 100)}% reliable`));
      }
    }

    agency.settlements.slice(-3).reverse().forEach((settlement) => add({ kind: 'settlement', id: settlement.id, position: settlement.position }, settlement.name, `${settlement.form.replaceAll('-', ' ')} · ${settlement.inhabitants} people`));
    agency.sites.slice(-3).reverse().forEach((site) => add({ kind: 'site', id: site.id, position: site.position }, site.title, site.kind));
    agency.regions.slice(0, 4).forEach((region) => add({ kind: 'region', id: region.id, position: region.position }, region.name, `${region.terrain} · ${Math.round(region.vitality * 100)}% vital`));
    if (!destinationOnly) add({ kind: 'commons', id: 'commons' }, 'The Commons', 'whole civilization');

    if (!destinationOnly && this.selectedTarget && !seen.has(targetKey(this.selectedTarget))) {
      add(this.selectedTarget, 'Selected in the world', this.selectedTarget.kind);
    }
    return options.slice(0, destinationOnly ? 10 : 12);
  }

  private renderActionPreview(preview: CivicActionPreview | null, input: CivicActionInput | null): void {
    const label = this.weaveButton.querySelector('span');
    if (!input || !preview) {
      this.previewTarget.textContent = this.selectedTarget?.kind.replaceAll('-', ' ') ?? 'Choose a target';
      this.previewTitle.textContent = this.selectedVoices[0] ? 'Choose where this action lands' : 'Choose a lead culture';
      this.previewCreates.textContent = DOMAIN_META[this.selectedDomain].creates;
      this.previewChanges.textContent = 'your forecast will appear here';
      this.previewRisk.textContent = 'costs are calculated before commitment';
      this.weaveButton.disabled = true;
      if (label) label.textContent = this.selectedVoices[0] ? 'Choose a target' : 'Choose a lead culture';
      return;
    }

    const direction = this.nanoForecast;
    const options = Array.isArray(direction?.options) ? direction.options as Array<Record<string, unknown>> : [];
    const nanoOption = options.find((option) => option.domain === input.domain && option.verb === input.verb)
      ?? options.find((option) => option.domain === input.domain);
    const nanoTitle = typeof nanoOption?.title === 'string'
      ? nanoOption.title
      : typeof direction?.publicName === 'string'
        ? direction.publicName
        : typeof direction?.title === 'string'
          ? direction.title
          : '';
    const nanoPromise = typeof nanoOption?.promise === 'string'
      ? nanoOption.promise
      : typeof direction?.consequence === 'string'
        ? direction.consequence
        : '';
    const nanoRisk = typeof nanoOption?.risk === 'string'
      ? nanoOption.risk
      : typeof direction?.costNarrative === 'string'
        ? direction.costNarrative
        : '';
    const deterministicCost = formatResourceCost(preview.cost);
    const physicalCost = Object.entries(preview.materialCost)
      .filter(([, value]) => Math.abs(value ?? 0) > 0.01)
      .map(([material, value]) => `${Math.abs(value ?? 0).toFixed(1)} ${material}${(value ?? 0) < 0 ? ' recovered' : ''}`)
      .join(', ');
    const workCost = `${preview.laborCost} ${preview.laborCost === 1 ? 'person' : 'people'} · ${preview.duration}s${physicalCost ? ` · ${physicalCost}` : ''}`;
    const chance = `${Math.round(preview.chance * 100)}% ${preview.predicted}`;

    this.previewTarget.textContent = preview.targetLabel;
    this.previewTitle.textContent = nanoTitle || preview.summary;
    this.previewCreates.textContent = nanoPromise || DOMAIN_META[this.selectedDomain].creates;
    this.previewChanges.textContent = preview.consequences.slice(0, 2).join(' · ') || `${Math.round(Math.abs(preview.pressureDelta) * 100)}% pressure shift`;
    this.previewRisk.textContent = `${deterministicCost} · ${workCost} · ${chance}${nanoRisk ? ` · ${nanoRisk}` : ''}`;
    this.previewTitle.closest<HTMLElement>('.command-preview')!.dataset.predicted = preview.predicted;
    this.weaveButton.disabled = !preview.valid;
    if (label) label.textContent = preview.valid
      ? `${VERB_LABELS[input.verb]} ${DOMAIN_META[input.domain].label}`
      : preview.errors[0] ?? 'Not possible yet';
    this.weaveButton.setAttribute('aria-label', preview.valid
      ? `${VERB_LABELS[input.verb]} ${DOMAIN_META[input.domain].label}. Cost: ${deterministicCost}. Forecast: ${chance}.`
      : label?.textContent ?? 'Civic action unavailable');
  }

  private requestNanoForecast(snapshot: SimulationSnapshot, input: CivicActionInput): void {
    if (!this.hasEntered) return;
    const key = [input.domain, input.verb, input.method, targetKey(input.target), input.lead, input.ally ?? '', input.intensity].join(':');
    if (key === this.lastForeseeKey) return;
    this.lastForeseeKey = key;
    window.clearTimeout(this.foreseeTimer);
    this.foreseeTimer = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('nolybab:nano-request', {
        detail: { kind: 'foresee', snapshot, input },
      }));
    }, 360);
  }

  private renderSelection(snapshot: SimulationSnapshot): void {
    const council = snapshot.council;
    const selectionKey = [
      snapshot.civicPhase,
      snapshot.currentQuestion?.id ?? '',
      this.selectedVoices.join(':'),
      this.selectedLessonId ?? '',
      council?.name ?? '',
      council?.voicesLine ?? '',
      council?.selectedProposalId ?? '',
      council?.proposals.map((proposal) => `${proposal.id}:${proposal.source}:${proposal.title}:${proposal.summary}:${proposal.workKind}`).join('~') ?? '',
      council?.pendingWork?.id ?? '',
    ].join('|');
    if (selectionKey === this.lastSelectionKey) return;
    this.lastSelectionKey = selectionKey;

    if (this.selectedVoices.length === 0) {
      this.selectedVoicesElement.innerHTML = '<span class="empty-selection">Choose a lead culture</span>';
    } else {
      this.selectedVoicesElement.innerHTML = this.selectedVoices.map((id, index) => {
        const voice = VOICE_BY_ID[id];
        return `<button class="voice-chip" data-selected-voice="${id}" style="--voice-color:${voice.cssColor}" title="${escapeHtml(voice.lens)}">
          <i>${index === 0 ? 'lead' : 'ally'}</i><span>${escapeHtml(voice.shortName)}</span><b>×</b>
        </button>`;
      }).join('<span class="weave-join">+</span>');
    }

    this.voiceRoster.innerHTML = VOICES.map((voice) => {
      const seat = this.selectedVoices.indexOf(voice.id);
      return `<button class="voice-choice" data-voice-id="${voice.id}" data-seat="${seat >= 0 ? seat + 1 : ''}" aria-pressed="${seat >= 0}" style="--voice-color:${voice.cssColor}" title="${escapeHtml(`${voice.lens}. Gift: ${voice.gift}. Shadow: ${voice.shadow}.`)}"><span>${escapeHtml(voice.shortName)}</span><small>${escapeHtml(voice.verb)}</small></button>`;
    }).join('');

    const lesson = this.selectedLessonId
      ? snapshot.lessons.find((candidate) => candidate.id === this.selectedLessonId && !candidate.resolved)
      : undefined;
    this.lessonChip.hidden = !lesson;
    if (lesson) this.lessonChip.textContent = `scar carried: ${lesson.title} ×`;

    this.proposalList.hidden = true;
    this.weaveButton.classList.toggle('has-memory', Boolean(lesson));
  }

  private renderProposals(proposals: CivicProposal[], selectedId: string | null, councilName: string, voicesLine?: string): void {
    const cards = proposals.map((proposal) => {
      const consent = Object.values(proposal.positions).filter((position) => position === 'consent').length;
      const color = QUALITY_META[proposal.focus].color;
      return `<button class="proposal-card" data-proposal-id="${proposal.id}" aria-pressed="${proposal.id === selectedId}" style="--proposal-color:${color}">
        <i>${modeLabel(proposal.mode)} · ${proposal.source === 'nano' ? 'Nano atelier' : `${consent}/7 consent`}</i>
        <strong>${escapeHtml(proposal.title)}</strong>
        <p>${escapeHtml(proposal.summary)}</p>
        <small>builds ${escapeHtml(workLabel(proposal.workKind))} · costs ${escapeHtml(proposal.cost.description)}</small>
      </button>`;
    }).join('');
    this.proposalList.innerHTML = `<header class="proposal-heading"><div><b>${escapeHtml(councilName)}</b><span>${escapeHtml(voicesLine ?? 'Two unlike truths are considering what may become real.')}</span></div><button type="button" data-release-council>Reseat voices</button></header>${cards}`;
  }

  private renderControls(snapshot: SimulationSnapshot): void {
    this.pauseButton.textContent = snapshot.paused ? '▶' : 'Ⅱ';
    this.pauseButton.setAttribute('aria-label', snapshot.paused ? 'Resume simulation' : 'Pause simulation');
    this.speedButton.textContent = `${snapshot.speed}×`;
    this.renderSoundButton(this.soundscape.isEnabled);
  }

  private renderSoundButton(enabled: boolean): void {
    this.soundButton.textContent = enabled ? '◉' : '◌';
    this.soundButton.classList.toggle('is-active', enabled);
    this.soundButton.setAttribute('aria-label', enabled ? 'Mute Whispers of the Sacred Canopy' : 'Play Whispers of the Sacred Canopy');
    this.soundButton.title = enabled ? 'Track 01 playing' : 'Play Track 01';
  }

  private renderNanoStatus(): void {
    const copy: Record<NanoStatus, { short: string; long: string }> = {
      quiet: { short: 'Nano atelier', long: 'The procedural atelier watches targets, arrivals, actions, and consequences.' },
      thinking: { short: 'Nano imagining', long: 'GPT-5.4 Nano is asking the Illustrator, Ecologist, Anthropologist, and Inventor what this move could become.' },
      connected: { short: 'Nano breathing', long: 'GPT-5.4 Nano is shaping names, forecasts, cultures, inventions, and visible world direction. Deterministic rules still govern cost and consequence.' },
      fallback: { short: 'Local atelier', long: 'Nano was unavailable, so the procedural gamemasters continued without interrupting the world.' },
    };
    this.nanoStatus.dataset.status = this.nanoState;
    this.nanoStatus.innerHTML = `<i></i> ${copy[this.nanoState].short}`;
    this.aiDisclosure.dataset.status = this.nanoState;
    this.aiDisclosureCopy.textContent = copy[this.nanoState].long;
    if (this.authorMode === 'choices') this.renderNanoChoices();
  }

  private renderMemory(snapshot: SimulationSnapshot, force = false): void {
    const key = `${snapshot.seedPhrase}:${snapshot.lessons.length}:${snapshot.history.length}:${snapshot.history[0]?.id ?? ''}:${this.selectedLessonId}:${snapshot.epoch}:${snapshot.works.length}`;
    if (!force && key === this.lastMemoryKey) return;
    this.lastMemoryKey = key;
    this.memoryCount.textContent = String(snapshot.lessons.filter((lesson) => !lesson.resolved).length);

    this.lessonList.innerHTML = snapshot.lessons.length === 0
      ? '<p class="empty-drawer">Mistake Mountain is quiet. It will not stay empty.</p>'
      : snapshot.lessons.slice().reverse().map((lesson) => {
        const selected = lesson.id === this.selectedLessonId;
        return `<button class="lesson-entry ${lesson.resolved ? 'is-resolved' : ''} ${selected ? 'is-selected' : ''}" data-lesson-id="${lesson.id}" ${lesson.resolved ? 'disabled' : ''}>
          <i>${lesson.resolved ? 'reframed' : `depth ${lesson.depth}`}</i><strong>${escapeHtml(lesson.title)}</strong>
          <span>${escapeHtml(lesson.resolved ? lesson.resolution ?? lesson.account : lesson.account)}</span>
          <em>${lesson.resolved ? 'now part of the action grammar' : selected ? 'carried into the current council' : 'touch to carry forward'}</em>
        </button>`;
      }).join('');

    this.historyList.innerHTML = `<h3>Recent civic thread</h3>${snapshot.history.slice(0, 14).map((entry) => `<article class="history-entry" data-kind="${entry.kind}">
      <time>e${entry.epoch} · p${entry.cycle}</time><div><strong>${escapeHtml(entry.title)}</strong><p>${escapeHtml(entry.detail)}</p></div>
    </article>`).join('')}`;
  }

  private renderDirectors(snapshot: SimulationSnapshot): void {
    this.activeDirectorCount.textContent = String(snapshot.directors.length);
    const key = snapshot.directors.map((director) => `${director.id}:${director.influence.toFixed(2)}:${director.thought}:${director.knob}:${snapshot.currentQuestion?.tags.includes(`challenged:${director.id}`)}`).join('|');
    if (key === this.lastDirectorKey) return;
    this.lastDirectorKey = key;
    this.directorList.innerHTML = snapshot.directors.slice().sort((a, b) => b.influence - a.influence).map((state) => {
      const director = DIRECTOR_BY_ID[state.id];
      const challenged = snapshot.currentQuestion?.tags.includes(`challenged:${state.id}`) ?? false;
      const nanoSpecialist = state.id === 'illustrator' || state.id === 'architect' || state.id === 'storyweaver';
      return `<article class="director-entry ${nanoSpecialist ? 'is-nano-specialist' : ''}" style="--director-color:${director.color}">
        <div class="director-topline"><i></i><div><strong>${escapeHtml(director.name)}</strong><span>${escapeHtml(director.epithet)} · ${director.specialist}${nanoSpecialist ? ' · Nano-capable' : ''}</span></div><b>${percent(state.influence)}</b></div>
        <p>${escapeHtml(state.thought)}</p><div class="influence-track"><em style="--influence:${state.influence}"></em></div>
        <div class="director-action"><span>turning: ${escapeHtml(state.knob)}</span><button data-challenge-director="${state.id}" ${challenged ? 'disabled' : ''}>${challenged ? 'framing opened' : 'challenge framing'}</button></div>
      </article>`;
    }).join('');

    const knobs = [
      ['dissonance', snapshot.knobs.dissonance],
      ['ecological pressure', snapshot.knobs.ecologicalPressure],
      ['memory pressure', snapshot.knobs.memoryPressure],
      ['novelty', snapshot.knobs.novelty],
      ['convergence', snapshot.knobs.convergence],
    ] as const;
    this.knobList.innerHTML = `<h3>Shared control surface</h3>${knobs.map(([label, value]) => `<div class="knob-row"><span>${label}</span><em><i style="--knob:${value}"></i></em><b>${percent(value)}</b></div>`).join('')}`;
  }

  private showCivicConsequence(result: CivicActionResult): void {
    window.clearTimeout(this.resultTimer);
    const input = result.input;
    const title = this.selectedNanoOption?.title || this.actionName.value.trim() || result.summary;
    this.resultKind.textContent = `${VERB_LABELS[input.verb]} · ${DOMAIN_META[input.domain].label} · ${result.outcome}`;
    this.resultTitle.textContent = title;
    this.resultCopy.textContent = result.summary;
    this.resultDelta.textContent = `${formatResourceCost(result.cost)} · ${result.createdIds.length} visible ${result.createdIds.length === 1 ? 'change' : 'changes'} · ${Math.round(Math.abs(result.pressureDelta) * 100)}% pressure shift`;
    this.resultWord.innerHTML = result.sideEffects.length
      ? `<strong>The world answers</strong><span>${escapeHtml(result.sideEffects.slice(0, 2).join(' · '))}</span>`
      : '<strong>Construction has begun</strong><span>Watch the map: people and materials are moving now.</span>';
    this.resultToast.classList.add('is-visible');
    this.resultToast.setAttribute('aria-hidden', 'false');
    this.resultTimer = window.setTimeout(() => {
      this.resultToast.classList.remove('is-visible');
      this.resultToast.setAttribute('aria-hidden', 'true');
    }, 6200);
  }

  private showOutcome(outcome: WeaveOutcome): void {
    window.clearTimeout(this.resultTimer);
    const work = this.simulation.snapshot.council?.pendingWork ?? this.simulation.snapshot.works.find((candidate) => candidate.id === outcome.workId);
    this.resultKind.textContent = outcome.kind === 'productive-mistake'
      ? 'Mistake Mountain grows'
      : outcome.kind === 'reframe'
        ? 'The action grammar changed'
        : 'Council action enters the world';
    this.resultTitle.textContent = outcome.title;
    this.resultCopy.textContent = outcome.account;
    this.resultDelta.textContent = outcome.kind === 'productive-mistake'
      ? 'Mistake Mountain · one visible stratum added'
      : outcome.kind === 'reframe'
        ? `Scar transformed · ${work ? workLabel(work.kind) : 'civic practice'} established`
        : `Commons expands · ${work ? workLabel(work.kind) : 'one civic work'} begins`;
    this.resultWord.innerHTML = outcome.sharedWord
      ? `<strong>${escapeHtml(outcome.sharedWord.word)}</strong><span>${escapeHtml(outcome.sharedWord.meaning)}</span>`
      : work
        ? `<strong>${escapeHtml(work.title)}</strong><span>${escapeHtml(work.art.caption)}</span>`
        : outcome.lesson
          ? '<span>The fracture remains visible. It can be carried into a future council.</span>'
          : '';
    this.resultToast.classList.add('is-visible');
    this.resultToast.setAttribute('aria-hidden', 'false');
    this.resultTimer = window.setTimeout(() => {
      this.resultToast.classList.remove('is-visible');
      this.resultToast.setAttribute('aria-hidden', 'true');
    }, 4600);
  }

  private showVoiceHover(voiceId: VoiceId | null, point?: { x: number; y: number }): void {
    if (!voiceId || !point || window.matchMedia('(hover: none)').matches) {
      this.hoverNote.classList.remove('is-visible');
      this.hoverNote.setAttribute('aria-hidden', 'true');
      return;
    }
    const voice = VOICE_BY_ID[voiceId];
    this.hoverNote.innerHTML = `<strong>${escapeHtml(voice.shortName)}</strong><span>${escapeHtml(voice.lens)}</span><em>shadow: ${escapeHtml(voice.shadow)}</em>`;
    this.hoverNote.style.left = `${Math.min(window.innerWidth - 280, point.x + 18)}px`;
    this.hoverNote.style.top = `${Math.min(window.innerHeight - 140, point.y + 18)}px`;
    this.hoverNote.classList.add('is-visible');
    this.hoverNote.setAttribute('aria-hidden', 'false');
  }

  private showCivicTargetHover(target: CivicTargetRef | null, point?: { x: number; y: number }): void {
    if (!target || !point || window.matchMedia('(hover: none)').matches) {
      this.hoverNote.classList.remove('is-visible');
      this.hoverNote.setAttribute('aria-hidden', 'true');
      return;
    }
    const option = this.collectCommandTargets(this.latestSnapshot, false).find((candidate) => targetKey(candidate.target) === targetKey(target));
    this.hoverNote.innerHTML = `<strong>${escapeHtml(option?.label ?? target.kind.replaceAll('-', ' '))}</strong><span>${escapeHtml(option?.meta ?? 'Selectable civic target')}</span><em>touch to author an action here</em>`;
    this.hoverNote.style.left = `${Math.min(window.innerWidth - 280, point.x + 18)}px`;
    this.hoverNote.style.top = `${Math.min(window.innerHeight - 140, point.y + 18)}px`;
    this.hoverNote.classList.add('is-visible');
    this.hoverNote.setAttribute('aria-hidden', 'false');
  }

  private handleKeyboard(event: KeyboardEvent): void {
    if (!this.hasEntered) return;
    if (event.key === 'Escape') {
      document.querySelectorAll<HTMLElement>('.side-drawer.is-open').forEach((drawer) => this.closeDrawer(drawer.id));
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('button, a, input, textarea, select, [contenteditable="true"], [role="button"], [role="tab"]')) return;
    if (event.key >= '1' && event.key <= '7') {
      const voice = VOICES[Number(event.key) - 1];
      if (voice) this.toggleVoice(voice.id);
    } else if (event.key === 'Enter') {
      this.executeCommand();
    } else if (event.key.toLowerCase() === 'm') {
      must<HTMLButtonElement>('memory-button').click();
    } else if (event.key.toLowerCase() === 'g') {
      must<HTMLButtonElement>('directors-button').click();
    } else if (event.key === '?') {
      must<HTMLButtonElement>('codex-button').click();
    } else if (event.key === ' ') {
      event.preventDefault();
      this.simulation.setPaused(!this.latestSnapshot.paused);
    }
  }
}
