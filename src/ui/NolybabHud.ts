import { DIRECTOR_BY_ID, QUALITY_META, VOICES, VOICE_BY_ID } from '../simulation/content';
import { QUALITY_KEYS } from '../simulation/types';
import type { LivingSoundscape } from '../audio/LivingSoundscape';
import type { NolybabScene } from '../rendering/NolybabScene';
import type { NolybabSimulation } from '../simulation/NolybabSimulation';
import type { DirectorId, SimulationSnapshot, VoiceId, WeaveOutcome } from '../simulation/types';

function must<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required UI element #${id}`);
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

export class NolybabHud {
  private readonly simulation: NolybabSimulation;
  private readonly scene: NolybabScene;
  private readonly soundscape: LivingSoundscape;
  private selectedVoices: VoiceId[] = [];
  private selectedLessonId: string | null = null;
  private latestSnapshot: SimulationSnapshot;
  private resultTimer = 0;
  private lastMemoryKey = '';
  private lastDirectorKey = '';
  private hasEntered = false;

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
  private readonly selectedVoicesElement = must<HTMLElement>('selected-voices');
  private readonly weaveButton = must<HTMLButtonElement>('weave-button');
  private readonly lessonChip = must<HTMLButtonElement>('lesson-chip');
  private readonly onboardingNudge = must<HTMLElement>('onboarding-nudge');
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
  private readonly resultWord = must<HTMLElement>('result-word');
  private readonly hoverNote = must<HTMLElement>('hover-note');

  constructor(
    simulation: NolybabSimulation,
    scene: NolybabScene,
    soundscape: LivingSoundscape,
    hasSavedWorld: boolean,
  ) {
    this.simulation = simulation;
    this.scene = scene;
    this.soundscape = soundscape;
    this.latestSnapshot = simulation.snapshot;
    this.bindWorldCallbacks();
    this.bindControls();

    if (hasSavedWorld) {
      this.continueButton.hidden = false;
      this.continueButton.textContent = `Return to “${simulation.snapshot.seedPhrase}”`;
      this.seedInput.placeholder = 'or name a different surviving truth…';
    }

    simulation.subscribe((snapshot) => {
      this.latestSnapshot = snapshot;
      this.render(snapshot);
      this.soundscape.adapt(snapshot);
    });
    simulation.onOutcome((outcome) => this.showOutcome(outcome));
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
    this.weaveButton.addEventListener('click', () => this.weave());
    this.lessonChip.addEventListener('click', () => this.selectLesson(this.selectedLessonId ?? ''));

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
      if (!window.confirm('Begin another Nolybab? The current world remains in this tab until the new seed is committed.')) return;
      this.simulation.setPaused(true);
      this.selectedVoices = [];
      this.selectedLessonId = null;
      this.seedInput.value = '';
      this.arrival.classList.remove('is-gone');
      this.seedInput.focus();
    });

    document.addEventListener(
      'pointermove',
      (event) => {
        if (!(event.target instanceof HTMLCanvasElement)) this.showVoiceHover(null);
      },
      { passive: true },
    );

    window.addEventListener('keydown', (event) => this.handleKeyboard(event));
  }

  private bindDrawerButton(buttonId: string, drawerId: string): void {
    const button = must<HTMLButtonElement>(buttonId);
    button.addEventListener('click', () => {
      const drawer = must<HTMLElement>(drawerId);
      const willOpen = !drawer.classList.contains('is-open');
      document.querySelectorAll<HTMLElement>('.side-drawer.is-open').forEach((open) => this.closeDrawer(open.id));
      drawer.classList.toggle('is-open', willOpen);
      drawer.setAttribute('aria-hidden', String(!willOpen));
      button.setAttribute('aria-expanded', String(willOpen));
    });
  }

  private closeDrawer(drawerId: string): void {
    if (!drawerId) return;
    const drawer = document.getElementById(drawerId);
    if (!drawer) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    const controllingButton = document.querySelector<HTMLButtonElement>(`[aria-controls="${drawerId}"]`);
    controllingButton?.setAttribute('aria-expanded', 'false');
  }

  private async beginNewWorld(): Promise<void> {
    const phrase = this.seedInput.value.trim();
    if (!phrase) {
      this.seedInput.classList.add('needs-answer');
      this.seedInput.focus();
      window.setTimeout(() => this.seedInput.classList.remove('needs-answer'), 650);
      return;
    }
    this.simulation.reseed(phrase);
    this.selectedVoices = [];
    this.selectedLessonId = null;
    this.scene.setSelectedVoices([]);
    this.scene.setSelectedLesson(null);
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
    const existing = this.selectedVoices.indexOf(voice);
    if (existing >= 0) {
      this.selectedVoices.splice(existing, 1);
    } else if (this.selectedVoices.length < 2) {
      this.selectedVoices.push(voice);
    } else {
      this.selectedVoices = [this.selectedVoices[1] as VoiceId, voice];
    }
    this.scene.setSelectedVoices(this.selectedVoices);
    this.soundscape.voice(voice);
    this.renderSelection();
    this.renderOnboarding();
  }

  private selectLesson(lessonId: string): void {
    const lesson = this.latestSnapshot.lessons.find((candidate) => candidate.id === lessonId && !candidate.resolved);
    this.selectedLessonId = lesson && this.selectedLessonId !== lessonId ? lessonId : null;
    this.scene.setSelectedLesson(this.selectedLessonId);
    this.renderSelection();
    this.renderMemory(this.latestSnapshot, true);
  }

  private weave(): void {
    if (this.selectedVoices.length !== 2 || !this.latestSnapshot.currentQuestion) return;
    const pair = [this.selectedVoices[0] as VoiceId, this.selectedVoices[1] as VoiceId] as [VoiceId, VoiceId];
    const outcome = this.simulation.weave(pair, this.selectedLessonId ?? undefined, false);
    if (!outcome) return;
    this.selectedVoices = [];
    this.selectedLessonId = null;
    this.scene.setSelectedVoices([]);
    this.scene.setSelectedLesson(null);
    this.soundscape.outcome(outcome);
    this.renderSelection();
    this.renderOnboarding();
  }

  private render(snapshot: SimulationSnapshot): void {
    this.renderQuestion(snapshot);
    this.renderQualities(snapshot);
    this.renderSelection();
    this.renderControls(snapshot);
    this.renderMemory(snapshot);
    this.renderDirectors(snapshot);
    this.renderOnboarding();
  }

  private renderQuestion(snapshot: SimulationSnapshot): void {
    const question = snapshot.currentQuestion;
    this.epochLabel.textContent = `${snapshot.epochName} epoch · pulse ${snapshot.cycle}`;
    if (!question) {
      this.questionOrigin.textContent = 'The world is metabolizing the last answer';
      this.questionTitle.textContent = 'Meaning is moving through the chorus';
      this.questionSituation.textContent = snapshot.interludeSeconds > 6 ? 'An epoch is changing shape. Every scar and shared word is being carried forward.' : 'Watch the threads propagate. The gamemasters are already turning the next question.';
      this.questionPrompt.textContent = 'The next living pressure will form without being summoned.';
      this.pulseClock.textContent = `${Math.ceil(snapshot.interludeSeconds)}s`;
      this.directorSigil.style.background = '#e8ddbd';
      return;
    }

    const director = DIRECTOR_BY_ID[question.director];
    this.questionOrigin.textContent = `${director.name} · ${director.epithet}`;
    this.questionTitle.textContent = question.title;
    this.questionSituation.textContent = question.situation;
    this.questionPrompt.textContent = question.prompt;
    this.pulseClock.textContent = `${Math.ceil(question.secondsLeft)}s`;
    this.directorSigil.style.background = director.color;
  }

  private renderQualities(snapshot: SimulationSnapshot): void {
    const values = QUALITY_KEYS.map((quality) => snapshot.qualities[quality]);
    values.slice(0, 4).forEach((value, index) => {
      const segment = this.knotGlyph.children.item(index) as HTMLElement | null;
      segment?.style.setProperty('--vital', String(value));
    });
    this.qualityList.innerHTML = QUALITY_KEYS.map((quality) => {
      const meta = QUALITY_META[quality];
      const value = snapshot.qualities[quality];
      return `<div class="quality-row" title="${escapeHtml(meta.description)}">
        <span><i style="--quality-color:${meta.color}"></i>${escapeHtml(meta.label)}</span>
        <b>${percent(value)}</b>
        <em style="--quality-color:${meta.color};--quality-value:${value}"></em>
      </div>`;
    }).join('');
  }

  private renderSelection(): void {
    if (this.selectedVoices.length === 0) {
      this.selectedVoicesElement.innerHTML = '<span class="empty-selection">No voices held</span>';
    } else {
      this.selectedVoicesElement.innerHTML = this.selectedVoices
        .map((id, index) => {
          const voice = VOICE_BY_ID[id];
          return `<button class="voice-chip" data-selected-voice="${id}" style="--voice-color:${voice.cssColor}" title="${escapeHtml(voice.lens)}">
            <i>${index + 1}</i><span>${escapeHtml(voice.shortName)}</span><b>×</b>
          </button>`;
        })
        .join('<span class="weave-join">⇄</span>');
      this.selectedVoicesElement.querySelectorAll<HTMLButtonElement>('[data-selected-voice]').forEach((button) => {
        button.addEventListener('click', () => this.toggleVoice(button.dataset.selectedVoice as VoiceId));
      });
    }

    const lesson = this.selectedLessonId
      ? this.latestSnapshot.lessons.find((candidate) => candidate.id === this.selectedLessonId && !candidate.resolved)
      : undefined;
    this.lessonChip.hidden = !lesson;
    if (lesson) this.lessonChip.textContent = `scar: ${lesson.title} ×`;
    this.weaveButton.disabled = this.selectedVoices.length !== 2 || !this.latestSnapshot.currentQuestion;
    this.weaveButton.classList.toggle('has-memory', Boolean(lesson));
    const label = this.weaveButton.querySelector('span');
    if (label) label.textContent = lesson ? 'Reframe through this weave' : 'Weave these truths';
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

  private renderMemory(snapshot: SimulationSnapshot, force = false): void {
    const key = `${snapshot.lessons.length}:${snapshot.history.length}:${this.selectedLessonId}:${snapshot.epoch}`;
    if (!force && key === this.lastMemoryKey) return;
    this.lastMemoryKey = key;
    this.memoryCount.textContent = String(snapshot.lessons.filter((lesson) => !lesson.resolved).length);

    if (snapshot.lessons.length === 0) {
      this.lessonList.innerHTML = '<p class="empty-drawer">Mistake Mountain is quiet. It will not stay empty.</p>';
    } else {
      this.lessonList.innerHTML = snapshot.lessons
        .slice()
        .reverse()
        .map((lesson) => {
          const selected = lesson.id === this.selectedLessonId;
          return `<button class="lesson-entry ${lesson.resolved ? 'is-resolved' : ''} ${selected ? 'is-selected' : ''}" data-lesson-id="${lesson.id}" ${lesson.resolved ? 'disabled' : ''}>
            <i>${lesson.resolved ? 'reframed' : `depth ${lesson.depth}`}</i>
            <strong>${escapeHtml(lesson.title)}</strong>
            <span>${escapeHtml(lesson.resolved ? lesson.resolution ?? lesson.account : lesson.account)}</span>
            <em>${lesson.resolved ? 'now part of the action grammar' : selected ? 'carried into the current question' : 'touch to carry forward'}</em>
          </button>`;
        })
        .join('');
    }

    this.historyList.innerHTML = `<h3>Recent thread</h3>${snapshot.history
      .slice(0, 12)
      .map(
        (entry) => `<article class="history-entry" data-kind="${entry.kind}">
          <time>e${entry.epoch} · p${entry.cycle}</time>
          <div><strong>${escapeHtml(entry.title)}</strong><p>${escapeHtml(entry.detail)}</p></div>
        </article>`,
      )
      .join('')}`;
  }

  private renderDirectors(snapshot: SimulationSnapshot): void {
    const key = snapshot.directors
      .map((director) => `${director.id}:${director.influence.toFixed(2)}:${director.thought}:${director.knob}:${snapshot.currentQuestion?.tags.includes(`challenged:${director.id}`)}`)
      .join('|');
    if (key === this.lastDirectorKey) return;
    this.lastDirectorKey = key;
    this.directorList.innerHTML = snapshot.directors
      .slice()
      .sort((a, b) => b.influence - a.influence)
      .map((state) => {
        const director = DIRECTOR_BY_ID[state.id];
        const challenged = snapshot.currentQuestion?.tags.includes(`challenged:${state.id}`) ?? false;
        return `<article class="director-entry" style="--director-color:${director.color}">
          <div class="director-topline"><i></i><div><strong>${escapeHtml(director.name)}</strong><span>${escapeHtml(director.epithet)}</span></div><b>${percent(state.influence)}</b></div>
          <p>${escapeHtml(state.thought)}</p>
          <div class="influence-track"><em style="--influence:${state.influence}"></em></div>
          <div class="director-action"><span>turning: ${escapeHtml(state.knob)}</span><button data-challenge-director="${state.id}" ${challenged ? 'disabled' : ''}>${challenged ? 'framing opened' : 'challenge framing'}</button></div>
        </article>`;
      })
      .join('');

    const knobs = [
      ['dissonance', snapshot.knobs.dissonance],
      ['ecological pressure', snapshot.knobs.ecologicalPressure],
      ['memory pressure', snapshot.knobs.memoryPressure],
      ['novelty', snapshot.knobs.novelty],
      ['convergence', snapshot.knobs.convergence],
    ] as const;
    this.knobList.innerHTML = `<h3>Shared control surface</h3>${knobs
      .map(
        ([label, value]) => `<div class="knob-row"><span>${label}</span><em><i style="--knob:${value}"></i></em><b>${percent(value)}</b></div>`,
      )
      .join('')}`;
  }

  private renderOnboarding(): void {
    if (this.latestSnapshot.resolvedQuestions > 0) {
      this.onboardingNudge.classList.add('is-gone');
      return;
    }
    if (this.selectedVoices.length === 0) {
      this.onboardingNudge.innerHTML = '<span>01 · listen</span>Touch two distant voices. Difference is the instrument.';
    } else if (this.selectedVoices.length === 1) {
      const voice = VOICE_BY_ID[this.selectedVoices[0] as VoiceId];
      this.onboardingNudge.innerHTML = `<span>02 · difference</span>${escapeHtml(voice.shortName)} ask: “${escapeHtml(voice.lens)}” Now choose a voice that might resist them.`;
    } else {
      this.onboardingNudge.innerHTML = '<span>03 · weave</span>No perfect answer is shown. Commit the meeting and watch what the civilization learns.';
    }
  }

  private showOutcome(outcome: WeaveOutcome): void {
    window.clearTimeout(this.resultTimer);
    this.resultKind.textContent =
      outcome.kind === 'productive-mistake' ? 'Mistake Mountain grows' : outcome.kind === 'reframe' ? 'The action grammar changed' : 'A living synthesis';
    this.resultTitle.textContent = outcome.title;
    this.resultCopy.textContent = outcome.account;
    this.resultWord.innerHTML = outcome.sharedWord
      ? `<strong>${escapeHtml(outcome.sharedWord.word)}</strong><span>${escapeHtml(outcome.sharedWord.meaning)}</span>`
      : outcome.lesson
        ? '<span>The fracture remains visible. It can be carried into a future question.</span>'
        : '';
    this.resultToast.classList.add('is-visible');
    this.resultToast.setAttribute('aria-hidden', 'false');
    this.resultTimer = window.setTimeout(() => {
      this.resultToast.classList.remove('is-visible');
      this.resultToast.setAttribute('aria-hidden', 'true');
    }, outcome.kind === 'reframe' ? 10000 : 7600);
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
    if (!this.hasEntered || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key >= '1' && event.key <= '7') {
      const voice = VOICES[Number(event.key) - 1];
      if (voice) this.toggleVoice(voice.id);
    } else if (event.key === 'Enter') {
      this.weave();
    } else if (event.key.toLowerCase() === 'm') {
      must<HTMLButtonElement>('memory-button').click();
    } else if (event.key.toLowerCase() === 'g') {
      must<HTMLButtonElement>('directors-button').click();
    } else if (event.key === ' ') {
      event.preventDefault();
      this.simulation.setPaused(!this.latestSnapshot.paused);
    } else if (event.key === 'Escape') {
      document.querySelectorAll<HTMLElement>('.side-drawer.is-open').forEach((drawer) => this.closeDrawer(drawer.id));
    }
  }
}
