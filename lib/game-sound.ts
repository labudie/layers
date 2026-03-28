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

export function playToneHz(freq: number, durationSec: number, volume = 0.12) {
  if (typeof window === "undefined") return;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, volume * 0.01),
    ctx.currentTime + durationSec
  );
  osc.connect(gain);
  gain.connect(ctx.destination);
  void ctx.resume().then(() => {
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationSec);
    window.setTimeout(() => void ctx.close(), Math.ceil((durationSec + 0.05) * 1000));
  });
}

export function playAscendingCelebration() {
  if (!readGameSoundEnabled()) return;
  const seq = [440, 554, 659, 784];
  let t = 0;
  for (let i = 0; i < seq.length; i++) {
    window.setTimeout(() => playToneHz(seq[i]!, 0.12, 0.1), t);
    t += 140;
  }
}
