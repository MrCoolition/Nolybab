import type { SimulationSnapshot, VoiceId, WeaveOutcome } from '../simulation/types';

const VOICE_NOTES: Record<VoiceId, number> = {
  pioneers: 220,
  innovators: 246.94,
  cultivators: 277.18,
  harbingers: 329.63,
  guardians: 369.99,
  ecostewards: 415.3,
  mountaineers: 493.88,
};

export class LivingSoundscape {
  private readonly track = new Audio('/audio/whispers-of-the-sacred-canopy.wav');
  private context: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private musicGain: GainNode | null = null;
  private fxGain: GainNode | null = null;
  private enabled = false;
  private initialized = false;

  constructor() {
    this.track.loop = true;
    this.track.preload = 'metadata';
    this.track.crossOrigin = 'anonymous';
    this.track.volume = 0.28;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  async setEnabled(enabled: boolean): Promise<boolean> {
    this.enabled = enabled;
    if (enabled) {
      await this.initialize();
      if (this.context?.state === 'suspended') await this.context.resume();
      try {
        await this.track.play();
      } catch {
        this.enabled = false;
      }
    } else {
      this.track.pause();
    }
    this.setMusicLevel(enabled ? 0.32 : 0.0001, 0.5);
    return this.enabled;
  }

  async toggle(): Promise<boolean> {
    return this.setEnabled(!this.enabled);
  }

  adapt(snapshot: SimulationSnapshot): void {
    if (!this.context || !this.filter || !this.musicGain) return;
    const now = this.context.currentTime;
    const openness = snapshot.qualities.biosphere * 0.55 + snapshot.qualities.wonder * 0.45;
    const cutoff = 850 + openness * 5200;
    this.filter.frequency.cancelScheduledValues(now);
    this.filter.frequency.linearRampToValueAtTime(cutoff, now + 1.8);
    this.filter.Q.linearRampToValueAtTime(0.35 + snapshot.knobs.dissonance * 1.2, now + 1.8);
    if (this.enabled) {
      const level = 0.23 + snapshot.qualities.coherence * 0.1;
      this.musicGain.gain.linearRampToValueAtTime(level, now + 1.8);
    }
  }

  voice(voice: VoiceId): void {
    if (!this.enabled || !this.context || !this.fxGain) return;
    this.tone(VOICE_NOTES[voice], 0.09, 0.85, 'sine');
  }

  outcome(outcome: WeaveOutcome): void {
    if (!this.enabled || !this.context || !this.fxGain) return;
    const base = VOICE_NOTES[outcome.voices[0]];
    const intervals = outcome.kind === 'productive-mistake' ? [1, 1.1892, 1.4142] : outcome.kind === 'reframe' ? [1, 1.25, 1.5, 2] : [1, 1.2599, 1.4983];
    intervals.forEach((interval, index) => {
      window.setTimeout(() => this.tone(base * interval, outcome.kind === 'reframe' ? 0.14 : 0.1, 1.8, 'sine'), index * 90);
    });
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    const AudioContextClass = window.AudioContext;
    this.context = new AudioContextClass();
    this.filter = this.context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 3200;
    this.filter.Q.value = 0.7;
    this.musicGain = this.context.createGain();
    this.musicGain.gain.value = 0.0001;
    this.fxGain = this.context.createGain();
    this.fxGain.gain.value = 0.14;

    try {
      this.source = this.context.createMediaElementSource(this.track);
      this.source.connect(this.filter);
      this.filter.connect(this.musicGain);
      this.musicGain.connect(this.context.destination);
      this.fxGain.connect(this.context.destination);
    } catch {
      this.track.volume = 0.24;
    }
  }

  private setMusicLevel(value: number, seconds: number): void {
    if (!this.context || !this.musicGain) {
      this.track.volume = value;
      return;
    }
    const now = this.context.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.linearRampToValueAtTime(value, now + seconds);
  }

  private tone(frequency: number, gain: number, duration: number, type: OscillatorType): void {
    if (!this.context || !this.fxGain) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain, now + 0.035);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(this.fxGain);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.05);
  }
}
