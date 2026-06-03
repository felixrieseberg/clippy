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

/**
 * A short percussive "pop" transient: a sine whose pitch drops fast, giving
 * that round, bubbly Slack-notification "bloop". Optionally preceded by a tiny
 * filtered-noise tick for a crisper attack.
 */
function pop(
  audio: AudioContext,
  at: number,
  freqStart: number,
  freqEnd: number,
  peak: number,
): void {
  const now = audio.currentTime + at;

  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freqStart, now);
  // Fast downward pitch glide is what makes it read as a "pop" rather than a beep.
  osc.frequency.exponentialRampToValueAtTime(freqEnd, now + 0.06);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

/**
 * Play a punchy Slack-style "pop" when Clippy pops up — a rounded bubble pop
 * with a soft higher tap right after, like an incoming notification.
 */
export function playPopSound(): void {
  const audio = getCtx();
  if (!audio) return;

  // Crisp little noise tick for the attack transient.
  const tickLen = Math.floor(audio.sampleRate * 0.015);
  const buffer = audio.createBuffer(1, tickLen, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < tickLen; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / tickLen);
  }
  const noise = audio.createBufferSource();
  noise.buffer = buffer;
  const bandpass = audio.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 2000;
  bandpass.Q.value = 0.7;
  const noiseGain = audio.createGain();
  noiseGain.gain.value = 0.04;
  noise.connect(bandpass).connect(noiseGain).connect(audio.destination);
  noise.start(audio.currentTime);

  // Main bubble pop, then a softer higher tap — the "incoming" lilt.
  pop(audio, 0, 660, 380, 0.14);
  pop(audio, 0.085, 940, 620, 0.06);
}
