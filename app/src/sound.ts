// Procedural muzzle report: filtered noise burst scaled by muzzle energy and gas pressure.
let ctx: AudioContext | null = null;

export function bang(energyJ: number, muzzlePressureMPa: number) {
  try {
    ctx = ctx ?? new AudioContext();
    const ac = ctx;
    const loud = Math.min(1, Math.max(0.12, Math.log10(1 + energyJ) / 3.6 + muzzlePressureMPa / 400));
    const dur = 0.3 + loud * 0.6;
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / ac.sampleRate;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t * (20 - loud * 12)) + 0.4 * Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t * 9) * loud;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700 + loud * 4000;
    const g = ac.createGain();
    g.gain.value = 0.85 * loud;
    src.connect(lp); lp.connect(g); g.connect(ac.destination);
    src.start();
  } catch {
    /* audio unavailable */
  }
}
