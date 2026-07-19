import type { NanoStatus } from '../ai/NanoGamemasterClient';
import { NanoGamemasterClient } from '../ai/NanoGamemasterClient';
import type { LivingSoundscape } from '../audio/LivingSoundscape';
import type { NolybabScene } from '../rendering/NolybabScene';
import { DIRECTOR_BY_ID, QUALITY_META, VOICES, VOICE_BY_ID } from '../simulation/content';
import type { NolybabSimulation } from '../simulation/NolybabSimulation';
import { QUALITY_KEYS } from '../simulation/types';
import type {
  CivicPhase,
  CivicProposal,
  DirectorId,
  ProposalMode,
  SimulationSnapshot,
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

const PHASES: CivicPhase[] = ['pressure', 'council', 'decision', 'action', 'growth'];

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
        this.selectedVoices = [];
        this.selectedLessonId = null;
        this.scene.setSelectedVoices([]);
        this.scene.setSelectedLesson(null);
      }
      this.syncCouncilSelection(snapshot);
      this.render(snapshot);
      this.soundscape.adapt(snapshot);
      this.maybeEnrichCouncil(snapshot);
    });
    simulation.onOutcome((outcome) => {
      this.selectedVoices = [];
      this.selectedLessonId = null;
      this.scene.setSelectedVoices([]);
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
  }

  private bindControls(): void {
    this.beginButton.addEventListener('click', () => void this.beginNewWorld());
    this.continueButton.addEventListener('click', () => void this.enterWorld());
    this.seedInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void this.beginNewWorld();
    });
    this.weaveButton.addEventListener('click', () => this.advanceCouncil());
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
    this.simulation.reseed(phrase);
    this.releaseLocalSelection();
    await this.enterWorld();
  }

  private async enterWorld(): Promise<void> {
    this.hasEntered = true;
    this.arrival.classList.add('is-gone');
    this.simulation.setPaused(false);
    const enabled = await this.soundscape.setEnabled(true);
    this.renderSoundButton(enabled);
    window.setTimeout(() => this.arrival.setAttribute('aria-hidden', 'true'), 900);
  }

  private toggleVoice(voice: VoiceId): void {
    if (!this.latestSnapshot.currentQuestion) return;
    if (this.latestSnapshot.civicPhase !== 'pressure') {
      if (this.latestSnapshot.civicPhase === 'council' || this.latestSnapshot.civicPhase === 'decision') this.releaseCouncil();
      else return;
    }
    const existing = this.selectedVoices.indexOf(voice);
    if (existing >= 0) this.selectedVoices.splice(existing, 1);
    else if (this.selectedVoices.length < 2) this.selectedVoices.push(voice);
    else this.selectedVoices = [this.selectedVoices[1] as VoiceId, voice];

    this.scene.setSelectedVoices(this.selectedVoices);
    this.soundscape.voice(voice);
    this.renderSelection(this.latestSnapshot);
    if (this.selectedVoices.length === 2) this.conveneSelected();
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
    if (this.latestSnapshot.civicPhase !== 'pressure') return;
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
    if (this.selectedVoices.join(':') !== council.authors.join(':')) {
      this.selectedVoices = [...council.authors];
      this.scene.setSelectedVoices(this.selectedVoices);
    }
    if (council.lessonId && !this.selectedLessonId) {
      this.selectedLessonId = council.lessonId;
      this.scene.setSelectedLesson(council.lessonId);
    }
  }

  private render(snapshot: SimulationSnapshot): void {
    this.renderQuestion(snapshot);
    this.renderPhase(snapshot);
    this.renderQualities(snapshot);
    this.renderSelection(snapshot);
    this.renderControls(snapshot);
    this.renderMemory(snapshot);
    this.renderDirectors(snapshot);
  }

  private renderQuestion(snapshot: SimulationSnapshot): void {
    const question = snapshot.currentQuestion;
    this.epochLabel.textContent = `${snapshot.epochName} epoch · pulse ${snapshot.cycle} · ${snapshot.works.length + snapshot.archivedWorkCount} civic works`;
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

    const first = this.selectedVoices[0] ? VOICE_BY_ID[this.selectedVoices[0]] : null;
    const proposal = snapshot.council?.proposals.find((candidate) => candidate.id === snapshot.council?.selectedProposalId);
    if (snapshot.civicPhase === 'pressure') {
      this.stageInstruction.textContent = this.selectedVoices.length === 0
        ? 'Seat a first voice, then a countervoice. The world will act if you do not.'
        : this.selectedVoices.length === 1
          ? `${first?.shortName} are seated. Choose a voice able to resist them.`
          : 'Two voices are held. The council is opening.';
    } else if (snapshot.civicPhase === 'council') {
      this.stageInstruction.textContent = `${snapshot.council?.name ?? 'The council'} offers three materially different actions. Choose one.`;
    } else if (snapshot.civicPhase === 'decision') {
      this.stageInstruction.textContent = proposal
        ? `Decision held: ${proposal.title}. Enact it, or choose another form.`
        : 'The council is waiting for a decision.';
    } else if (snapshot.civicPhase === 'action') {
      this.stageInstruction.textContent = `The council is acting. ${snapshot.council?.pendingWork?.title ?? 'A civic work'} is becoming visible.`;
    } else {
      this.stageInstruction.textContent = `Witness the growth. ${snapshot.works.at(-1)?.title ?? 'The Commons'} now alters future choices.`;
    }
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
      this.selectedVoicesElement.innerHTML = '<span class="empty-selection">Two voices are waiting to be heard</span>';
    } else {
      this.selectedVoicesElement.innerHTML = this.selectedVoices.map((id, index) => {
        const voice = VOICE_BY_ID[id];
        return `<button class="voice-chip" data-selected-voice="${id}" style="--voice-color:${voice.cssColor}" title="${escapeHtml(voice.lens)}">
          <i>${index + 1}</i><span>${escapeHtml(voice.shortName)}</span><b>×</b>
        </button>`;
      }).join('<span class="weave-join">⇄</span>');
    }

    this.voiceRoster.innerHTML = VOICES.map((voice) => {
      const seat = this.selectedVoices.indexOf(voice.id);
      return `<button class="voice-choice" data-voice-id="${voice.id}" data-seat="${seat >= 0 ? seat + 1 : ''}" aria-pressed="${seat >= 0}" style="--voice-color:${voice.cssColor}" title="${escapeHtml(voice.lens)}">${escapeHtml(voice.shortName)}</button>`;
    }).join('');

    const lesson = this.selectedLessonId
      ? snapshot.lessons.find((candidate) => candidate.id === this.selectedLessonId && !candidate.resolved)
      : undefined;
    this.lessonChip.hidden = !lesson;
    if (lesson) this.lessonChip.textContent = `scar carried: ${lesson.title} ×`;

    const proposal = council?.proposals.find((candidate) => candidate.id === council.selectedProposalId);
    const showProposals = Boolean(council && (snapshot.civicPhase === 'council' || snapshot.civicPhase === 'decision'));
    this.proposalList.hidden = !showProposals;
    if (showProposals && council) this.renderProposals(council.proposals, council.selectedProposalId, council.name, council.voicesLine);

    this.weaveButton.classList.toggle('has-memory', Boolean(lesson));
    const label = this.weaveButton.querySelector('span');
    if (snapshot.civicPhase === 'pressure') {
      this.weaveButton.disabled = true;
      if (label) label.textContent = this.selectedVoices.length === 0 ? 'Seat two voices' : 'Seat one more voice';
    } else if (snapshot.civicPhase === 'council') {
      this.weaveButton.disabled = true;
      if (label) label.textContent = 'Choose a proposal';
    } else if (snapshot.civicPhase === 'decision' && proposal) {
      this.weaveButton.disabled = false;
      if (label) label.textContent = `Enact ${proposal.title}`;
    } else {
      this.weaveButton.disabled = true;
      if (label) label.textContent = snapshot.civicPhase === 'action' ? 'Council is acting' : 'World is growing';
    }
    this.weaveButton.setAttribute('aria-label', label?.textContent ?? 'Council action');
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
      quiet: { short: 'Nano atelier', long: 'Procedural atelier is awake. Nano joins each council from the server.' },
      thinking: { short: 'Nano is sketching', long: 'GPT-5.4 Nano is convening the Illustrator, Architect, and Storyweaver.' },
      connected: { short: 'Nano breathing', long: 'GPT-5.4 Nano enriched the current council. Deterministic rules still govern consent and consequence.' },
      fallback: { short: 'Local atelier', long: 'Nano was unavailable, so the procedural gamemasters continued without interrupting the world.' },
    };
    this.nanoStatus.dataset.status = this.nanoState;
    this.nanoStatus.innerHTML = `<i></i> ${copy[this.nanoState].short}`;
    this.aiDisclosure.dataset.status = this.nanoState;
    this.aiDisclosureCopy.textContent = copy[this.nanoState].long;
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
      this.advanceCouncil();
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
