import { useEffect, useRef } from 'react';
import type { Sample, ScenarioInput, ScenarioResult } from '../types';
import { fitCanvas, heat, roundRect } from './canvas';
import type { T } from '../i18n';
import { fmt } from '../units';

interface Particle { x: number; y: number; vx: number; vy: number; r: number; grow: number; life: number; max: number; a: number; c: string }

interface Props {
  scenario: ScenarioInput;
  result: ScenarioResult | null;
  sample: Sample | null;
  /** Fraction of the interior animation elapsed (0..1), drives particle spawning. */
  progress: number;
  playing: boolean;
  exited: boolean;
  slowLabel: string;
  t: T;
  lang: string;
}

const GRAINS = Array.from({ length: 160 }, (_, i) => {
  // deterministic pseudo-random layout
  const r = (n: number) => { const x = Math.sin(n * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x); };
  return { fx: r(1), fy: r(2), s: 0.6 + r(3) * 0.8, k: r(4) };
});

export default function Cutaway({ scenario: u, result, sample: s, progress, playing, exited, slowLabel, t, lang }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const flashFrames = useRef(0);
  const wasExited = useRef(false);

  useEffect(() => {
    if (exited && !wasExited.current && playing) flashFrames.current = 8;
    if (!exited || !playing) particles.current = [];
    wasExited.current = exited;
  }, [exited, playing]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const { ctx, w, h } = fitCanvas(cv, cv.clientWidth < 560 ? 210 : 260);
    ctx.clearRect(0, 0, w, h);
    const hilo = u.layout === 'high_low';
    const r = result?.interior;
    const pHpk = r?.p_high_max || 1;
    const pLpk = r?.p_low_max || 1;

    const bore = Math.max(u.bore_mm, 1);
    let L: number, caseOD: number, caseL: number, blockL = 0, projBase0: number;
    if (hilo) {
      caseL = Math.max(u.case_len_mm, 5);
      caseOD = 10;
      blockL = caseL + 6;
      const lowL = Math.max(2, (u.low_vol_cm3 * 1000) / ((Math.PI * bore * bore) / 4));
      projBase0 = blockL + lowL;
      L = projBase0 + u.barrel_mm + u.proj_len_mm;
    } else {
      caseL = u.case_len_mm;
      caseOD = bore * 1.2;
      projBase0 = Math.max(0, u.oal_mm - u.proj_len_mm);
      L = u.barrel_mm;
    }
    const narrow = w < 560;
    const top = narrow ? 64 : 56, bottom = 30, margin = 18;
    const extra = L * 0.18 + 10;
    const sx = (w - margin * 2) / (L + extra);
    const cy = top + (h - top - bottom) / 2;
    const maxDia = hilo ? bore + 16 : caseOD + bore * 0.6;
    const sy = Math.min(((h - top - bottom) * 0.92) / maxDia, sx * 4.5, 12);
    const X = (mm: number) => margin + mm * sx;
    const Y = (mm: number) => cy + mm * sy;
    const projBase = projBase0 + (s ? s.x * 1000 : 0);

    // Barrel body (gunmetal)
    const wall = hilo ? 6 : bore * 0.35;
    const outer = hilo ? bore / 2 + wall : Math.max(caseOD / 2, bore / 2) + wall;
    const grad = ctx.createLinearGradient(0, Y(-outer), 0, Y(outer));
    grad.addColorStop(0, '#4a4f45'); grad.addColorStop(0.5, '#2c3029'); grad.addColorStop(1, '#1d201b');
    ctx.fillStyle = grad;
    ctx.fillRect(X(0), Y(-outer), X(L) - X(0), Y(outer) - Y(-outer));
    ctx.fillStyle = '#090a08';
    ctx.fillRect(X(0), Y(-bore / 2), X(L) - X(0), Y(bore / 2) - Y(-bore / 2));
    if (u.twist_mm > 0) {
      ctx.strokeStyle = 'rgba(200,185,138,0.07)';
      const pitch = Math.max(6, bore * 1.5);
      for (let x = (hilo ? blockL : caseL) + 4; x < L; x += pitch) {
        ctx.beginPath(); ctx.moveTo(X(x), Y(-bore / 2)); ctx.lineTo(X(x + bore), Y(bore / 2)); ctx.stroke();
      }
    }
    if (hilo) {
      ctx.fillStyle = '#3a3f35';
      ctx.fillRect(X(0), Y(-bore / 2), X(blockL) - X(0), Y(bore / 2) - Y(-bore / 2));
      ctx.fillStyle = '#090a08';
      ctx.fillRect(X(0), Y(-caseOD / 2 - 0.5), X(caseL + 1) - X(0), Y(caseOD / 2 + 0.5) - Y(-caseOD / 2 - 0.5));
      ctx.fillRect(X(caseL), Y(-u.vent_d_mm / 2), X(blockL) - X(caseL), Math.max(2, Y(u.vent_d_mm / 2) - Y(-u.vent_d_mm / 2)));
    } else {
      ctx.fillStyle = '#090a08';
      ctx.fillRect(X(0), Y(-caseOD / 2), X(caseL) - X(0), Y(caseOD / 2) - Y(-caseOD / 2));
    }
    // Brass case
    const caseR = caseOD / 2;
    const th = Math.max(0.4, caseR * 0.12);
    ctx.fillStyle = '#b8892d';
    ctx.fillRect(X(0), Y(-caseR), X(caseL) - X(0), Y(-caseR + th) - Y(-caseR));
    ctx.fillRect(X(0), Y(caseR - th), X(caseL) - X(0), Y(caseR) - Y(caseR - th));
    ctx.fillRect(X(0), Y(-caseR), Math.max(3, X(1.2) - X(0)), Y(caseR) - Y(-caseR));
    ctx.fillStyle = '#c9c9c9';
    ctx.fillRect(X(0), Y(-caseR * 0.35), Math.max(2, X(0.8) - X(0)), Y(caseR * 0.35) - Y(-caseR * 0.35));

    // Gas
    if (s) {
      const fH = Math.pow(Math.min(1, s.p_high / pHpk), 0.6);
      if (s.p_high > 0.3e6) {
        ctx.fillStyle = heat(fH);
        ctx.globalAlpha = 0.25 + 0.7 * fH;
        ctx.fillRect(X(1.2), Y(-caseR + th), X(caseL) - X(1.2), Y(caseR - th) - Y(-caseR + th));
        if (!hilo) ctx.fillRect(X(caseL), Y(-bore / 2), Math.max(0, Math.min(X(projBase), X(L)) - X(caseL)), Y(bore / 2) - Y(-bore / 2));
        ctx.globalAlpha = 1;
      }
      if (hilo && s.p_low > 0.12e6) {
        const fL = Math.pow(Math.min(1, s.p_low / pLpk), 0.6);
        ctx.fillStyle = heat(fL * 0.85);
        ctx.globalAlpha = 0.2 + 0.7 * fL;
        ctx.fillRect(X(blockL), Y(-bore / 2), Math.max(0, Math.min(X(projBase), X(L)) - X(blockL)), Y(bore / 2) - Y(-bore / 2));
        ctx.globalAlpha = 1;
      }
    }
    // Powder grains
    const psi = s ? s.psi : 0;
    const visible = Math.round(GRAINS.length * (1 - psi));
    const burning = !!s && s.p_high > 1e6;
    for (let i = 0; i < visible; i++) {
      const g = GRAINS[i];
      const gx = 1.5 + g.fx * (caseL - 2.5) * (hilo ? 1 : 0.9);
      const gy = (g.fy - 0.5) * (caseR - th) * 1.8;
      ctx.fillStyle = burning ? (g.k > 0.5 ? '#ffb347' : '#ff7a1a') : '#6b7a4f';
      const rr = Math.max(0.8, g.s * Math.min(sx, sy) * 0.35) * (burning ? 0.8 : 1);
      ctx.beginPath(); ctx.arc(X(gx), Y(gy), rr, 0, Math.PI * 2); ctx.fill();
    }
    // Projectile
    const pl = u.proj_len_mm;
    if (projBase < L + extra) {
      if (hilo) {
        const dimpled = u.drag.kind === 'blunt_nose' && u.drag.surface === 'dimpled';
        ctx.fillStyle = '#23251f'; ctx.strokeStyle = '#5a5f52';
        roundRect(ctx, X(projBase), Y(-bore / 2 + 0.6), X(projBase + pl) - X(projBase), Y(bore / 2 - 0.6) - Y(-bore / 2 + 0.6), Math.min(14, (X(projBase + pl) - X(projBase)) * 0.45));
        ctx.fill(); ctx.stroke();
        if (dimpled) {
          ctx.fillStyle = '#121310';
          for (let k = 0; k < 9; k++) {
            const ang = (k / 8 - 0.5) * 2.2;
            ctx.beginPath();
            ctx.arc(X(projBase + pl) - 6 - Math.cos(ang) * 6, Y(Math.sin(ang) * bore * 0.38), 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (u.stabilisation === 'fins') {
          ctx.fillStyle = '#5a5f52';
          ctx.fillRect(X(projBase) - 6, Y(-bore / 2 + 0.6), 6, 4);
          ctx.fillRect(X(projBase) - 6, Y(bore / 2 - 0.6) - 4, 6, 4);
        }
      } else {
        const nose = pl * 0.45;
        ctx.fillStyle = '#c8783a';
        ctx.beginPath();
        ctx.moveTo(X(projBase), Y(-bore / 2)); ctx.lineTo(X(projBase + pl - nose), Y(-bore / 2));
        ctx.quadraticCurveTo(X(projBase + pl - nose * 0.2), Y(-bore / 2), X(projBase + pl), Y(0));
        ctx.quadraticCurveTo(X(projBase + pl - nose * 0.2), Y(bore / 2), X(projBase + pl - nose), Y(bore / 2));
        ctx.lineTo(X(projBase), Y(bore / 2)); ctx.closePath(); ctx.fill();
      }
    }
    // Particles
    const ps = particles.current;
    if (s && playing) {
      if (hilo && r?.t_vent !== null && r && s.t >= (r.t_vent ?? 0) && s.p_high > s.p_low * 1.2 && s.p_high > 1e6) {
        for (let k = 0; k < 3; k++) ps.push({ x: caseL + 1, y: (Math.random() - 0.5) * u.vent_d_mm, vx: 1 + Math.random() * 3, vy: (Math.random() - 0.5) * 1.2, r: 0.8 + Math.random(), grow: 1.03, life: 18, max: 18, a: 0.8, c: Math.random() > 0.5 ? '#ffcc66' : '#ff8a3a' });
      }
      if (progress < 0.03) {
        for (let k = 0; k < 4; k++) ps.push({ x: 1, y: (Math.random() - 0.5) * caseR, vx: Math.random() * 1.5, vy: Math.random() - 0.5, r: 0.6 + Math.random() * 0.6, grow: 1, life: 10, max: 10, a: 1, c: '#fff6c0' });
      }
    }
    if (flashFrames.current > 0) {
      for (let k = 0; k < 8; k++) {
        ps.push({ x: L, y: (Math.random() - 0.5) * bore, vx: L * 0.004 + Math.random() * L * 0.01, vy: (Math.random() - 0.5) * bore * 0.25, r: bore * (0.3 + Math.random() * 0.4), grow: 1.04, life: 26, max: 26, a: 0.9, c: Math.random() > 0.4 ? '#ffd27a' : '#ff6a2a' });
        ps.push({ x: L, y: (Math.random() - 0.5) * bore, vx: L * 0.002 + Math.random() * L * 0.004, vy: (Math.random() - 0.5) * bore * 0.08, r: Math.min(bore * 0.25, 6), grow: 1.02, life: 45, max: 45, a: 0.18, c: '#8a8f80' });
      }
      flashFrames.current--;
    }
    if (!playing) ps.length = 0;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.x += p.vx; p.y += p.vy; p.life -= 1; p.r *= p.grow;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life / p.max) * p.a;
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), p.r * Math.min(sx, sy), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // HUD
    ctx.font = `${narrow ? 10 : 12}px "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace`;
    ctx.fillStyle = '#c8b98a';
    ctx.textAlign = 'left';
    if (s) {
      const lines = [
        `t = ${fmt(s.t * 1e3, 3, lang)} ms   v = ${fmt(s.v, 0, lang)} m/s`,
        hilo ? `${t('p_cart')} ${fmt(s.p_high / 1e6, 1, lang)} MPa · ${t('p_chamber')} ${fmt(s.p_low / 1e6, 2, lang)} MPa` : `${t('p_max')} : ${fmt(s.p_breech / 1e6, 0, lang)} MPa`,
        `${fmt(s.x * 1000, 1, lang)} mm · ${t('burnt')} ${fmt(s.psi * 100, 0, lang)} %`,
      ];
      lines.forEach((l, i) => ctx.fillText(l, 10, 16 + i * (narrow ? 13 : 15)));
      if (slowLabel) { ctx.textAlign = 'right'; ctx.fillStyle = '#e0a43a'; ctx.fillText(slowLabel, w - 10, 16); }
    } else {
      ctx.fillText(t('idle'), 10, 16);
    }
    ctx.textAlign = 'left'; ctx.fillStyle = '#6f7562';
    ctx.fillText(`${fmt(L, 0, lang)} mm`, X(0), h - 8);
    ctx.strokeStyle = '#4a4f45'; ctx.beginPath(); ctx.moveTo(X(0), h - 20); ctx.lineTo(X(L), h - 20); ctx.stroke();
  });

  return <canvas ref={ref} className="stage-canvas" aria-label="vue en coupe" />;
}
