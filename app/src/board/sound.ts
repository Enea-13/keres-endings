/** A soft wooden "tap" synthesised with WebAudio (no audio files to ship). */
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function context(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length / 7));
  }
  return ctx;
}

export function tap(kind: "move" | "capture" | "error" = "move"): void {
  try {
    const ac = context();
    if (ac.state === "suspended") void ac.resume();
    const src = ac.createBufferSource();
    src.buffer = noise;
    const filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = kind === "capture" ? 1150 : kind === "error" ? 260 : 1700;
    filter.Q.value = kind === "error" ? 2 : 5;
    const gain = ac.createGain();
    gain.gain.value = kind === "capture" ? 0.9 : 0.55;
    src.connect(filter).connect(gain).connect(ac.destination);
    src.start();
  } catch {
    /* audio unavailable */
  }
}
