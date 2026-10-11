// Web Audio API synthesized warning sound for language mismatch and critical alerts
let lastWarningSoundTime = 0;

/**
 * Plays an audible, distinct attention-grabbing warning chime/beep
 * using Web Audio API (zero external assets, 100% offline & instant).
 * Throttled to avoid deafening repetitive bursts while typing.
 */
export function playLanguageWarningSound(force = false): void {
  const now = Date.now();
  // Throttle to at most once every 1.5 seconds unless forced
  if (!force && now - lastWarningSoundTime < 1500) {
    return;
  }
  lastWarningSoundTime = now;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();

    // If context is suspended (browser autoplay policy), resume it
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const t = ctx.currentTime;

    // Tone 1: High warning pulse (880 Hz - note A5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, t);
    gain1.gain.setValueAtTime(0, t);
    gain1.gain.linearRampToValueAtTime(0.4, t + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.16);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.16);

    // Tone 2: Lower follow-up alert tone (587.33 Hz - note D5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(587.33, t + 0.18);
    gain2.gain.setValueAtTime(0, t + 0.18);
    gain2.gain.linearRampToValueAtTime(0.45, t + 0.20);
    gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t + 0.18);
    osc2.stop(t + 0.45);
  } catch (err) {
    // Graceful fallback if audio is not permitted in current context
    console.debug("Web Audio alert could not be played:", err);
  }
}
