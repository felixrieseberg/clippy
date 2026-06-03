/**
 * A short, soft synthesized "blip" played when Clippy pops up to heckle.
 * Synthesized with the Web Audio API so we don't have to ship an audio asset.
 */

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let ctx: AudioContext | undefined;

function getCtx(): AudioContext | undefined {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext || (window as WebkitWindow).webkitAudioContext;
      if (!Ctor) return undefined;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    return ctx;
  } catch {
    return undefined;
  }
}

/** Play a quick two-note "ba-doop" — the sound of an unwanted guest arriving. */
export function playPopSound(): void {
  const audio = getCtx();
  if (!audio) return;

  const now = audio.currentTime;
  const notes = [
    { freq: 520, at: 0 },
    { freq: 740, at: 0.09 },
  ];

  for (const { freq, at } of notes) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now + at);
    gain.gain.setValueAtTime(0.0001, now + at);
    gain.gain.exponentialRampToValueAtTime(0.07, now + at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.12);
    osc.connect(gain).connect(audio.destination);
    osc.start(now + at);
    osc.stop(now + at + 0.13);
  }
}
