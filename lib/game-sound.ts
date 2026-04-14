const STORAGE_KEY = "layers_sound_enabled";

export function readGameSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === null) return true;
    return v !== "false";
  } catch {
    return true;
  }
}

export function writeGameSoundEnabled(on: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "true" : "false");
  } catch {
    /* ignore */
  }
}

// --- Shared AudioContext (one per page lifetime) ---

let sharedAudioContext: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AC();
  }
  return sharedAudioContext;
}

/** Cached stereo impulse per sample rate (for ConvolverNode reverb). */
const reverbImpulseCache = new Map<number, AudioBuffer>();

function getReverbImpulseBuffer(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  let buf = reverbImpulseCache.get(rate);
  if (!buf) {
    const durationSec = 0.32;
    const decay = 3.2;
    const len = Math.floor(rate * durationSec);
    buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] =
          (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * 0.42;
      }
    }
    reverbImpulseCache.set(rate, buf);
  }
  return buf;
}

const reverbConvolverByCtx = new WeakMap<AudioContext, ConvolverNode>();

function getSharedReverbConvolver(ctx: AudioContext): ConvolverNode {
  let conv = reverbConvolverByCtx.get(ctx);
  if (!conv) {
    conv = ctx.createConvolver();
    conv.buffer = getReverbImpulseBuffer(ctx);
    reverbConvolverByCtx.set(ctx, conv);
  }
  return conv;
}

function withAudio(
  fn: (ctx: AudioContext, now: number) => void
): void {
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  void ctx.resume().then(() => {
    fn(ctx, ctx.currentTime);
  });
}

/** Slight reverb: dry + wet convolver in parallel. */
function playToneWithLightReverb(
  ctx: AudioContext,
  t0: number,
  freq: number,
  durationSec: number,
  peakGain: number,
  oscType: OscillatorType
) {
  const osc = ctx.createOscillator();
  osc.type = oscType;
  osc.frequency.setValueAtTime(freq, t0);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(peakGain, t0 + 0.018);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

  osc.connect(env);

  const dry = ctx.createGain();
  dry.gain.value = 0.72;
  const wet = ctx.createGain();
  wet.gain.value = 0.38;
  const conv = getSharedReverbConvolver(ctx);
  const master = ctx.createGain();
  master.gain.value = 0.92;

  env.connect(dry);
  env.connect(conv);
  conv.connect(wet);
  dry.connect(master);
  wet.connect(master);
  master.connect(ctx.destination);

  osc.start(t0);
  osc.stop(t0 + durationSec + 0.12);
}

function playChime(
  ctx: AudioContext,
  t0: number,
  freq: number,
  durationSec: number,
  peakGain: number,
  oscType: OscillatorType = "sine"
) {
  const osc = ctx.createOscillator();
  osc.type = oscType;
  osc.frequency.setValueAtTime(freq, t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peakGain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + durationSec + 0.03);
}

/** Wrong: descending "wah wah" with light reverb. */
export function playWrongGuessSound() {
  if (!readGameSoundEnabled()) return;
  withAudio((ctx, now) => {
    playToneWithLightReverb(ctx, now, 400, 0.15, 0.14, "triangle");
    playToneWithLightReverb(ctx, now + 0.15, 200, 0.15, 0.12, "triangle");
  });
}

/** Correct: rapid ascending slot dings + sustained high. */
export function playCorrectGuessSound() {
  if (!readGameSoundEnabled()) return;
  withAudio((ctx, now) => {
    const freqs = [400, 600, 800, 1000];
    const step = 0.08;
    freqs.forEach((f, i) => {
      playChime(ctx, now + i * step, f, 0.082, 0.13);
    });
    const sustainStart = now + freqs.length * step;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, sustainStart);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, sustainStart);
    g.gain.exponentialRampToValueAtTime(0.1, sustainStart + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, sustainStart + 0.48);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(sustainStart);
    osc.stop(sustainStart + 0.55);
  });
}

/** Close: quick near-miss two-tone. */
export function playCloseGuessSound() {
  if (!readGameSoundEnabled()) return;
  withAudio((ctx, now) => {
    playChime(ctx, now, 300, 0.07, 0.12, "sine");
    playChime(ctx, now + 0.055, 450, 0.08, 0.14, "sine");
  });
}

/** Perfect day / jackpot: run-up + three high chimes. */
export function playJackpotCompletionSound() {
  if (!readGameSoundEnabled()) return;
  withAudio((ctx, now) => {
    const run = [300, 400, 500, 600, 800, 1000];
    const spacing = 0.048;
    const noteDur = 0.056;
    run.forEach((f, i) => {
      playChime(ctx, now + i * spacing, f, noteDur, 0.12);
    });
    const tail = now + run.length * spacing + 0.02;
    const highs = [1100, 1400, 1100];
    highs.forEach((f, j) => {
      playChime(ctx, tail + j * 0.11, f, 0.14, 0.15);
    });
  });
}

/** Short sine tick for dialpad (no reverb). */
function playSoftTap(
  ctx: AudioContext,
  t0: number,
  freqHz: number,
  durationSec: number,
  peakGain: number
) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freqHz, t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(peakGain, t0);
  g.gain.linearRampToValueAtTime(0, t0 + durationSec);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + durationSec + 0.002);
}

export function playDialPadTone(key: string) {
  if (!readGameSoundEnabled()) return;
  withAudio((ctx, now) => {
    if (key === "delete") {
      playSoftTap(ctx, now, 900, 0.03, 0.15);
      return;
    }
    // Submit (✓): same tap as number keys — no two-tone chime.
    playSoftTap(ctx, now, 1200, 0.03, 0.15);
  });
}

/** Achievement-style unlock: quick 800 → 1000 → 1200, then held 1000 Hz. */
export function playBadgeUnlockSound() {
  if (!readGameSoundEnabled()) return;
  const vol = 0.15;
  withAudio((ctx, now) => {
    const step = 0.06;
    playChime(ctx, now, 800, step, vol, "sine");
    playChime(ctx, now + step, 1000, step, vol, "sine");
    playChime(ctx, now + 2 * step, 1200, step, vol, "sine");
    const tHold = now + 3 * step;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1000, tHold);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, tHold);
    g.gain.exponentialRampToValueAtTime(vol, tHold + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, tHold + 0.3);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(tHold);
    osc.stop(tHold + 0.32);
  });
}
