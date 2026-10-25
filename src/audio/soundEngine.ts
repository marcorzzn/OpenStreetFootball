import { BallProfileId, GagId } from '../types/game';

class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted: boolean = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playKick(profile: BallProfileId, power: number = 0.7) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (profile === 'supersantos') {
      // Iconic hollow plastic "PING-BOING" sound of a Super Santos!
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(340 + power * 120, now);
      osc.frequency.exponentialRampToValueAtTime(135, now + 0.16);
      gain.gain.setValueAtTime(0.32 * Math.max(0.3, power), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    } else if (profile === 'bagnato') {
      // Heavy wet thud
      osc.type = 'sine';
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.14);
      gain.gain.setValueAtTime(0.45 * Math.max(0.4, power), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    } else if (profile === 'bucato') {
      // Flat papery thwack + air puff
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.09);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      this.playHiss(0.18);
    } else {
      // Classic leather thump
      osc.type = 'sine';
      osc.frequency.setValueAtTime(165 + power * 50, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.12);
      gain.gain.setValueAtTime(0.35 * Math.max(0.3, power), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playBounce(profile: BallProfileId, speed: number) {
    const intensity = Math.min(1, speed / 14);
    if (intensity < 0.08) return;
    this.playKick(profile, intensity * 0.45);
  }

  public playPostHit() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(290, now + 0.35);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.37);
  }

  public playWhistle(doubleWhistle = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const blow = (start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(2750, start);
      lfo.frequency.setValueAtTime(42, start);
      lfoGain.gain.setValueAtTime(140, start);

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      gain.gain.setValueAtTime(0.01, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.setValueAtTime(0.18, start + duration - 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      lfo.start(start);
      osc.stop(start + duration);
      lfo.stop(start + duration);
    };

    blow(now, 0.22);
    if (doubleWhistle) {
      blow(now + 0.28, 0.38);
    }
  }

  public playGoalCheer() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.playWhistle(true);

    const now = ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.14, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.56);
    });
  }

  public playHiss(duration = 0.6) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3400;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  public playGagSound(gag: GagId) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (gag === 'vecchia_buca') {
      // Scissors snip + angry voice warble + long deflation hiss
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.linearRampToValueAtTime(420, now + 0.15);
      osc.frequency.linearRampToValueAtTime(710, now + 0.3);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.36);
      this.playHiss(0.9);
    } else if (gag === 'finestra_rotta') {
      // Glass shatter burst
      for (let i = 0; i < 6; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1400 + Math.random() * 2200, now + i * 0.03);
        gain.gain.setValueAtTime(0.14, now + i * 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.03 + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.03);
        osc.stop(now + i * 0.03 + 0.15);
      }
    } else if (gag === 'allarme_auto') {
      // Classic Italian street car alarm BEEP BEEP BEEP
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now + i * 0.22);
        osc.frequency.setValueAtTime(660, now + i * 0.22 + 0.1);
        gain.gain.setValueAtTime(0.16, now + i * 0.22);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.22 + 0.19);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.22);
        osc.stop(now + i * 0.22 + 0.2);
      }
    } else if (gag === 'tombino_fogna') {
      // Hollow drain plop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(380, now + 0.14);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    } else if (gag === 'palla_tetto') {
      // Tile clatter
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.22);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  }
}

export const soundEngine = new SoundEngine();
