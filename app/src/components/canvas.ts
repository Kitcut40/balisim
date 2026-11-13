// Shared canvas helpers.

export function fitCanvas(cv: HTMLCanvasElement, cssH: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth || cv.parentElement?.clientWidth || 600;
  const h = cssH;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.height = `${h}px`;
  }
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / e;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * e;
}

/** 0..1 -> hot gas colour. */
export function heat(f: number): string {
  f = Math.max(0, Math.min(1, f));
  const stops: [number, number[]][] = [[0, [40, 10, 10]], [0.25, [150, 30, 10]], [0.5, [240, 100, 20]], [0.75, [255, 190, 60]], [1, [255, 250, 220]]];
  for (let i = 1; i < stops.length; i++) {
    if (f <= stops[i][0]) {
      const [a0, ac] = stops[i - 1];
      const [b0, bc] = stops[i];
      const k = (f - a0) / (b0 - a0);
      const c = ac.map((x, j) => Math.round(x + (bc[j] - x) * k));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return 'rgb(255,250,220)';
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

export function shortNum(v: number, precise = false): string {
  const a = Math.abs(v);
  if (a >= 10000) return (v / 1000).toFixed(a >= 100000 ? 0 : 1) + 'k';
  if (a >= 100) return Math.round(v).toString();
  if (a >= 10) return precise ? v.toFixed(1) : Math.round(v).toString();
  return v.toFixed(precise ? 2 : 1).replace(/\.0+$/, '');
}
