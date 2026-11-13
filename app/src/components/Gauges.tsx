import { useEffect, useRef } from 'react';
import type { Sample, ScenarioResult } from '../types';
import { fitCanvas, niceMax, shortNum } from './canvas';
import type { T } from '../i18n';
import { toDisplay, unitLabel, type UnitSystem } from '../units';

function Dial({ label, unit, value, max, color, sub }: { label: string; unit: string; value: number | null; max: number; color: string; sub?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const w0 = cv.clientWidth || 160;
    const { ctx, w, h } = fitCanvas(cv, Math.round(w0 * 0.82));
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.53, r = Math.min(w * 0.4, h * 0.42);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(4, r * 0.09);
    ctx.strokeStyle = '#2a2e25';
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
    const f = Math.max(0, Math.min(1, (value ?? 0) / max));
    ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + (a1 - a0) * f); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1; ctx.strokeStyle = '#4f5547'; ctx.fillStyle = '#7d8370';
    ctx.font = `${Math.max(9, r * 0.12)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= 10; i++) {
      const a = a0 + ((a1 - a0) * i) / 10;
      const r1 = r * 0.8, r2 = r * (i % 5 === 0 ? 0.68 : 0.74);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); ctx.stroke();
      if (i % 5 === 0) ctx.fillText(shortNum((max * i) / 10), cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55);
    }
    const an = a0 + (a1 - a0) * f;
    ctx.strokeStyle = '#e8e2cc'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(an) * r * 0.86, cy + Math.sin(an) * r * 0.86); ctx.stroke();
    ctx.fillStyle = '#e8e2cc'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9aa087'; ctx.font = `600 ${Math.max(10, r * 0.13)}px "Stardos Stencil", system-ui, sans-serif`;
    ctx.fillText(label, cx, 9);
    ctx.fillStyle = color; ctx.font = `800 ${Math.max(14, r * 0.26)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.fillText(value === null ? '—' : shortNum(value, true), cx, cy + r * 0.74);
    ctx.fillStyle = '#7d8370'; ctx.font = `${Math.max(9, r * 0.12)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.fillText(unit + (sub ? '  ' + sub : ''), cx, cy + r * 1.0);
  });
  return <div className="card gauge"><canvas ref={ref} /></div>;
}

export default function Gauges({ sample, result, units, t }: { sample: Sample | null; result: ScenarioResult | null; units: UnitSystem; t: T }) {
  const hilo = !!result && result.interior.p_low_max > 0;
  const r = result?.interior;
  const pPeak = r ? (hilo ? r.p_low_max : r.p_breech_max) / 1e6 : 300;
  const v0 = r?.muzzle_velocity || 1000;
  const m = result?.muzzle && result.muzzle.velocity > 0 ? (2 * result.muzzle.energy) / (result.muzzle.velocity ** 2) : 0.008;
  const P = sample ? (hilo ? sample.p_low : sample.p_breech) / 1e6 : null;
  const v = sample ? sample.v : null;
  const E = v !== null ? 0.5 * m * v * v : null;
  const d = (x: number | null, k: Parameters<typeof toDisplay>[1]) => (x === null ? null : toDisplay(x, k, units));
  return (
    <section className="gauges">
      <Dial label={hilo ? t('p_chamber') : t('p_max')} unit={unitLabel('pressure', units)} value={d(P, 'pressure')} max={niceMax(toDisplay(pPeak * 1.1, 'pressure', units))} color="#e0a43a"
        sub={hilo && sample ? `${t('p_cart')} ${shortNum(toDisplay(sample.p_high / 1e6, 'pressure', units))}` : ''} />
      <Dial label={t('velocity')} unit={unitLabel('velocity', units)} value={d(v, 'velocity')} max={niceMax(toDisplay(v0 * 1.1, 'velocity', units))} color="#8fb35a"
        sub={v !== null ? `${Math.round(v * 3.6)} km/h` : ''} />
      <Dial label={t('energy')} unit={unitLabel('energy', units)} value={d(E, 'energy')} max={niceMax(toDisplay(0.5 * m * v0 * v0 * 1.1, 'energy', units))} color="#d9483b" />
      <Dial label={t('burnt')} unit="%" value={sample ? sample.psi * 100 : null} max={100} color="#c8b98a" />
    </section>
  );
}
