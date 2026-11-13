import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { ScenarioResult } from '../types';
import type { T } from '../i18n';
import { toDisplay, unitLabel, type UnitSystem } from '../units';

export type ChartKind = 'p' | 'v' | 'burn' | 'traj' | 'e' | 'vd' | 'barrel';

interface Series { label: string; color: string; dash?: number[]; x: number[]; y: number[] }
interface Pin { color: string; name: string; result: ScenarioResult }

interface Props {
  current: ScenarioResult | null;
  pins: Pin[];
  units: UnitSystem;
  t: T;
  barrelSweep: { name: string; color: string; points: [number, number][] }[];
  onNeedSweep: () => void;
}

const KINDS: ChartKind[] = ['p', 'v', 'burn', 'traj', 'e', 'vd', 'barrel'];
const TITLES: Record<ChartKind, string> = { p: 'c_pressure', v: 'c_velocity', burn: 'c_burn', traj: 'c_traj', e: 'c_energy', vd: 'c_vdist', barrel: 'c_barrel' };

function seriesFor(r: ScenarioResult, kind: ChartKind, color: string, label: string, units: UnitSystem, t: T): Series[] {
  if (!r.ok) return [];
  const S = r.interior.samples;
  const hilo = r.interior.p_low_max > 0;
  const P = (pa: number) => toDisplay(pa / 1e6, 'pressure', units);
  switch (kind) {
    case 'p':
      return hilo
        ? [
            { label: `${label} — ${t('p_cart')}`, color, dash: [6, 4], x: S.map((s) => s.t * 1e3), y: S.map((s) => P(s.p_high)) },
            { label: `${label} — ${t('p_chamber')}`, color, x: S.map((s) => s.t * 1e3), y: S.map((s) => P(s.p_low)) },
          ]
        : [{ label, color, x: S.map((s) => s.t * 1e3), y: S.map((s) => P(s.p_breech)) }];
    case 'v':
      return [{ label, color, x: S.map((s) => toDisplay(s.x * 1000, 'length_mm', units)), y: S.map((s) => toDisplay(s.v, 'velocity', units)) }];
    case 'burn':
      return [{ label, color, x: S.map((s) => s.t * 1e3), y: S.map((s) => s.psi * 100) }];
    case 'traj':
      return [{ label, color, x: r.max_range_points.map((p) => toDisplay(p.x, 'distance_m', units)), y: r.max_range_points.map((p) => toDisplay(p.y, 'distance_m', units)) }];
    case 'e':
      return [{ label, color, x: r.table.map((p) => toDisplay(p.distance, 'distance_m', units)), y: r.table.map((p) => toDisplay(p.energy, 'energy', units)) }];
    case 'vd':
      return [{ label, color, x: r.table.map((p) => toDisplay(p.distance, 'distance_m', units)), y: r.table.map((p) => toDisplay(p.velocity, 'velocity', units)) }];
    default:
      return [];
  }
}

function axes(kind: ChartKind, units: UnitSystem, t: T): [string, string] {
  switch (kind) {
    case 'p': return [t('ax_time_ms'), `${t('p_max')} (${unitLabel('pressure', units)})`];
    case 'v': return [`${t('ax_travel_mm')} (${unitLabel('length_mm', units)})`.replace('(mm) (mm)', '(mm)'), `${t('velocity')} (${unitLabel('velocity', units)})`];
    case 'burn': return [t('ax_time_ms'), `${t('burnt')} (%)`];
    case 'traj': return [`${t('ax_distance')} (${unitLabel('distance_m', units)})`, `${t('ax_height')} (${unitLabel('distance_m', units)})`];
    case 'e': return [`${t('ax_distance')} (${unitLabel('distance_m', units)})`, `${t('energy')} (${unitLabel('energy', units)})`];
    case 'vd': return [`${t('ax_distance')} (${unitLabel('distance_m', units)})`, `${t('velocity')} (${unitLabel('velocity', units)})`];
    case 'barrel': return [`${t('barrel_len')} (${unitLabel('length_mm', units)})`, `${t('velocity')} (${unitLabel('velocity', units)})`];
  }
}

export default function Charts({ current, pins, units, t, barrelSweep, onNeedSweep }: Props) {
  const [kind, setKind] = useState<ChartKind>('p');
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);

  useEffect(() => {
    if (kind === 'barrel') onNeedSweep();
  }, [kind, current, onNeedSweep]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let series: Series[] = [];
    if (kind === 'barrel') {
      series = barrelSweep.map((b) => ({ label: b.name, color: b.color, x: b.points.map((p) => toDisplay(p[0], 'length_mm', units)), y: b.points.map((p) => toDisplay(p[1], 'velocity', units)) }));
    } else {
      for (const p of pins) series.push(...seriesFor(p.result, kind, p.color, p.name, units, t));
      if (current) series.push(...seriesFor(current, kind, '#e0a43a', t('current'), units, t));
    }
    plot.current?.destroy();
    plot.current = null;
    el.innerHTML = '';
    if (!series.length) return;
    const tables = series.map((s) => {
      // uPlot needs increasing x: sort pairs and drop duplicates.
      const pairs = s.x.map((x, i) => [x, s.y[i]] as [number, number]).sort((a, b) => a[0] - b[0]);
      const xs: number[] = [], ys: number[] = [];
      for (const [x, y] of pairs) { if (xs.length && x === xs[xs.length - 1]) continue; xs.push(x); ys.push(y); }
      return [xs, ys] as uPlot.AlignedData;
    });
    const data = uPlot.join(tables);
    const [xl, yl] = axes(kind, units, t);
    const width = el.clientWidth || 600;
    const axisStyle = { stroke: '#9aa087', grid: { stroke: '#22261e' }, ticks: { stroke: '#2f3429' } };
    plot.current = new uPlot(
      {
        width,
        height: width < 560 ? 260 : 320,
        scales: { x: { time: false } },
        legend: { live: false },
        cursor: { drag: { x: true, y: false } },
        axes: [{ ...axisStyle, label: xl }, { ...axisStyle, label: yl, size: 60 }],
        series: [{}, ...series.map((s) => ({ label: s.label, stroke: s.color, width: s.color === '#e0a43a' ? 2 : 1.5, dash: s.dash, spanGaps: true, points: { show: false } }))],
      },
      data,
      el,
    );
    const onResize = () => plot.current?.setSize({ width: el.clientWidth, height: el.clientWidth < 560 ? 260 : 320 });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [kind, current, pins, units, t, barrelSweep]);

  return (
    <section className="card">
      <h3>{t('charts')}</h3>
      <div className="tabs">
        {KINDS.map((k) => (
          <button key={k} className={k === kind ? 'on' : ''} onClick={() => setKind(k)}>{t(TITLES[k])}</button>
        ))}
      </div>
      <div ref={host} className="chart-host" />
    </section>
  );
}
