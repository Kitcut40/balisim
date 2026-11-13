import { useEffect, useRef } from 'react';
import type { Point, ScenarioResult } from '../types';
import { fitCanvas, niceMax } from './canvas';
import type { T } from '../i18n';
import { fmt, toDisplay, unitLabel, type UnitSystem } from '../units';

interface Pin { color: string; result: ScenarioResult }

interface Props {
  result: ScenarioResult | null;
  pins: Pin[];
  view: 'target' | 'max';
  progress: number | null;
  units: UnitSystem;
  t: T;
  lang: string;
}

export default function FlightView({ result, pins, view, progress, units, t, lang }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const { ctx, w, h } = fitCanvas(cv, cv.clientWidth < 560 ? 230 : 280);
    ctx.clearRect(0, 0, w, h);
    const narrow = w < 560;
    ctx.font = `${narrow ? 10 : 12}px "JetBrains Mono", ui-monospace, monospace`;
    if (!result || !result.ok) {
      ctx.fillStyle = '#6f7562';
      ctx.fillText(result?.error ?? t('idle'), 12, 20);
      return;
    }
    const isT = view === 'target';
    if (isT && !result.hit) {
      ctx.fillStyle = '#d9483b';
      ctx.fillText(`${t('out_of_range')} — ${t('max_range')} ${fmt(toDisplay(result.max_range_m, 'distance_m', units), 0, lang)} ${unitLabel('distance_m', units)}`, 12, 20);
      return;
    }
    const pts: Point[] = isT ? result.hit!.points : result.max_range_points;
    const D = result.hit ? result.hit.point.x : 0;
    const xMax = isT ? D * 1.08 : result.max_range_m * 1.04;
    const groundY = -(result.max_range_points[0] ? 0 : 0);
    let yMin = 0, yMax = 0;
    for (const p of pts) { yMax = Math.max(yMax, p.y); yMin = Math.min(yMin, p.y); }
    const flat = isT ? result.table.filter((r) => r.distance <= xMax).map((r) => ({ x: r.distance, y: -r.drop })) : [];
    for (const p of flat) yMin = Math.min(yMin, p.y);
    if (!isT) yMin = Math.min(yMin, -1.5 + groundY);
    const pad = { l: narrow ? 46 : 58, r: 14, t: narrow ? 34 : 22, b: 26 };
    const span = yMax - yMin || 1;
    yMax += span * 0.15; yMin -= span * 0.1;
    const X = (x: number) => pad.l + (x / xMax) * (w - pad.l - pad.r);
    const Y = (y: number) => h - pad.b - ((y - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);
    const useDrop = isT && yMax - yMin < 8;
    // grid
    ctx.strokeStyle = '#22261e'; ctx.fillStyle = '#6f7562'; ctx.lineWidth = 1;
    const xsD = niceMax(toDisplay(xMax, 'distance_m', units) / 6);
    ctx.textAlign = 'center';
    for (let xd = 0; xd <= toDisplay(xMax, 'distance_m', units) + 1e-9; xd += xsD) {
      const xm = xd / toDisplay(1, 'distance_m', units);
      ctx.beginPath(); ctx.moveTo(X(xm), pad.t); ctx.lineTo(X(xm), h - pad.b); ctx.stroke();
      ctx.fillText(`${fmt(xd, 0, lang)} ${unitLabel('distance_m', units)}`, X(xm), h - 8);
    }
    const yKind = useDrop ? 'drop_m' : 'distance_m';
    const yf = toDisplay(1, yKind, units);
    const ysD = niceMax(((yMax - yMin) * yf) / 4);
    ctx.textAlign = 'right';
    for (let yd = Math.ceil((yMin * yf) / ysD) * ysD; yd <= yMax * yf; yd += ysD) {
      const ym = yd / yf;
      ctx.beginPath(); ctx.moveTo(pad.l, Y(ym)); ctx.lineTo(w - pad.r, Y(ym)); ctx.stroke();
      ctx.fillText(`${fmt(yd, 0, lang)} ${unitLabel(yKind, units)}`, pad.l - 6, Y(ym) + 4);
    }
    ctx.strokeStyle = '#4f5547'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(xMax), Y(0)); ctx.stroke(); ctx.setLineDash([]);
    if (!isT) {
      ctx.fillStyle = '#1f2a16';
      ctx.fillRect(pad.l, Y(-1.5), w - pad.l - pad.r, h - pad.b - Y(-1.5));
    }
    // pins
    for (const pin of pins) {
      const pp = isT ? pin.result.hit?.points : pin.result.max_range_points;
      if (!pp) continue;
      ctx.strokeStyle = pin.color; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5;
      ctx.beginPath();
      pp.forEach((p, i) => { if (p.x > xMax) return; i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)); });
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (flat.length) {
      ctx.strokeStyle = '#7d8370'; ctx.setLineDash([2, 3]);
      ctx.beginPath(); flat.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.stroke(); ctx.setLineDash([]);
    }
    const tEnd = pts[pts.length - 1].t;
    const tNow = progress === null ? tEnd : progress * tEnd;
    ctx.strokeStyle = '#e0a43a'; ctx.lineWidth = 2;
    ctx.beginPath();
    let last = pts[0];
    for (let i = 0; i < pts.length; i++) { const p = pts[i]; if (p.t > tNow) break; last = p; i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)); }
    ctx.stroke();
    if (isT) {
      const tx = X(D), tr = Math.max(14, (h - pad.t - pad.b) * 0.12);
      ctx.fillStyle = '#e8e2cc'; ctx.fillRect(tx - 3, Y(0) - tr, 6, tr * 2);
      ctx.fillStyle = '#d9483b'; ctx.fillRect(tx - 3, Y(0) - tr * 0.3, 6, tr * 0.6);
    }
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(X(last.x), Y(last.y), 3.5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    const m = result.muzzle && result.muzzle.velocity > 0 ? (2 * result.muzzle.energy) / result.muzzle.velocity ** 2 : 0;
    ctx.textAlign = 'left'; ctx.fillStyle = '#e8e2cc';
    ctx.fillText(`t ${fmt(last.t, 2, lang)} s   ${fmt(toDisplay(last.x, 'distance_m', units), 0, lang)} ${unitLabel('distance_m', units)}   ${fmt(toDisplay(last.v, 'velocity', units), 0, lang)} ${unitLabel('velocity', units)}   ${fmt(toDisplay(0.5 * m * last.v * last.v, 'energy', units), 0, lang)} ${unitLabel('energy', units)}`, pad.l + 6, 14);
    if (isT && tNow >= tEnd && result.hit) {
      ctx.fillStyle = '#e0a43a';
      ctx.textAlign = narrow ? 'left' : 'right';
      ctx.fillText(`IMPACT ${fmt(toDisplay(result.hit.impact.velocity, 'velocity', units), 0, lang)} ${unitLabel('velocity', units)} · ${fmt(toDisplay(result.hit.impact.energy, 'energy', units), 0, lang)} ${unitLabel('energy', units)}`, narrow ? pad.l + 6 : w - pad.r - 6, narrow ? 28 : 14);
    }
  });
  return <canvas ref={ref} className="stage-canvas" aria-label="trajectoire" />;
}
