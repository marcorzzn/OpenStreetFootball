import { BallProfileId, GagId, VoiceShoutId } from '../types/game';

class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted: boolean = false;
  public wavesEnabled: boolean = true;
  private wavesSource: AudioBufferSourceNode | null = null;
  private wavesGain: GainNode | null = null;
  private wavesLfo: OscillatorNode | null = null;

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

  public playBounce(profile: BallProfileId, speed: number, isMuddy: boolean = false) {
    const intensity = Math.min(1, speed / 14);
    if (intensity < 0.08) return;
    if (isMuddy) {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const power = intensity * 0.45;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(88, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.16);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(135, now);

      gain.gain.setValueAtTime(0.48 * Math.max(0.4, power), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
      return;
    }
    this.playKick(profile, intensity * 0.45);
  }

  public playSlideSound(isViolent = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const duration = isViolent ? 0.36 : 0.22;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = isViolent ? 620 : 950;
    filter.Q.value = 1.4;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(isViolent ? 0.28 : 0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  public playJumpSound() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.11);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playSaveSound() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(68, now + 0.14);
    gain.gain.setValueAtTime(0.38, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playFoulWhistle() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Triple energetic referee whistle for Foul / Penalty / Handball
    const blow = (start: number, duration: number, freq: number) => {
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      lfo.frequency.setValueAtTime(48, start);
      lfoGain.gain.setValueAtTime(165, start);

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      gain.gain.setValueAtTime(0.01, start);
      gain.gain.linearRampToValueAtTime(0.24, start + 0.02);
      gain.gain.setValueAtTime(0.24, start + duration - 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      lfo.start(start);
      osc.stop(start + duration);
      lfo.stop(start + duration);
    };

    blow(now, 0.14, 2850);
    blow(now + 0.18, 0.14, 2850);
    blow(now + 0.36, 0.45, 2980);
  }

  /**
   * Synthesizes human-like vocal formants for street football shouts ("PASSALA!", "TIRO IO!", "UOMO!", "FALLO!")
   */
  public playVoiceShout(shoutId: VoiceShoutId) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const syllables: Array<{ offset: number; dur: number; f0: number; f1: number }> =
      shoutId === 'passala'
        ? [
            { offset: 0, dur: 0.13, f0: 195, f1: 780 },
            { offset: 0.15, dur: 0.12, f0: 230, f1: 860 },
            { offset: 0.29, dur: 0.22, f0: 175, f1: 720 },
          ]
        : shoutId === 'tiro_io'
          ? [
              { offset: 0, dur: 0.14, f0: 215, f1: 420 },
              { offset: 0.16, dur: 0.14, f0: 185, f1: 540 },
              { offset: 0.32, dur: 0.24, f0: 245, f1: 820 },
            ]
          : shoutId === 'uomo'
            ? [
                { offset: 0, dur: 0.18, f0: 168, f1: 480 },
                { offset: 0.2, dur: 0.22, f0: 145, f1: 520 },
              ]
            : [
                { offset: 0, dur: 0.14, f0: 230, f1: 820 },
                { offset: 0.16, dur: 0.16, f0: 260, f1: 920 },
                { offset: 0.34, dur: 0.28, f0: 210, f1: 760 },
              ];

    syllables.forEach((syl) => {
      const start = now + syl.offset;
      const osc = ctx.createOscillator();
      const formant = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(syl.f0, start);
      osc.frequency.linearRampToValueAtTime(syl.f0 * 0.92, start + syl.dur);

      formant.type = 'bandpass';
      formant.frequency.setValueAtTime(syl.f1, start);
      formant.Q.setValueAtTime(3.2, start);

      gain.gain.setValueAtTime(0.01, start);
      gain.gain.linearRampToValueAtTime(0.26, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, start + syl.dur);

      osc.connect(formant);
      formant.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + syl.dur + 0.01);
    });
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
    } else if (gag === 'cane_palla') {
      [0, 0.18].forEach((offset) => {
        const start = now + offset;
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(210, start);
        osc.frequency.linearRampToValueAtTime(360, start + 0.04);
        osc.frequency.exponentialRampToValueAtTime(140, start + 0.13);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(680, start);
        filter.Q.setValueAtTime(2.4, start);

        gain.gain.setValueAtTime(0.28, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.15);
      });
    } else if (gag === 'gabbiano_palla') {
      [0, 0.24].forEach((offset, idx) => {
        const start = now + offset;
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(idx === 0 ? 1450 : 1620, start);
        osc.frequency.exponentialRampToValueAtTime(820, start + 0.2);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1500, start);
        filter.Q.setValueAtTime(3.2, start);

        gain.gain.setValueAtTime(0.18, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.21);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.22);
      });
    }
  }

  public playDogGrab() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.08);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playTrickCheer() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    [1, 1.25].forEach((ratio) => {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220 * ratio, now);
      osc.frequency.exponentialRampToValueAtTime(440 * ratio, now + 0.34);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(520, now);
      filter.frequency.exponentialRampToValueAtTime(980, now + 0.34);
      filter.Q.setValueAtTime(1.8, now);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.39);
    });
  }

  public setBeachWavesActive(shouldPlay: boolean) {
    const active = shouldPlay && this.wavesEnabled && !this.muted;
    if (!active) {
      if (this.wavesSource) {
        try {
          this.wavesSource.stop();
          this.wavesLfo?.stop();
        } catch {
          // ignore
        }
        this.wavesSource.disconnect();
        this.wavesGain?.disconnect();
        this.wavesLfo?.disconnect();
        this.wavesSource = null;
        this.wavesGain = null;
        this.wavesLfo = null;
      }
      return;
    }

    if (this.wavesSource) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const bufferSize = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 210;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.18;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 110;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const gain = ctx.createGain();
    gain.gain.value = 0.032;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
    lfo.start();

    this.wavesSource = noise;
    this.wavesGain = gain;
    this.wavesLfo = lfo;
  }
}

export const soundEngine = new SoundEngine();
