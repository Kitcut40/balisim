import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { engineKind, loadLibrary, runScenario } from './engine';
import { makeT, type Lang } from './i18n';
import { normalizeScenario, type Library, type Preset, type Sample, type ScenarioInput, type ScenarioResult } from './types';
import { fmt, toDisplay, unitLabel, type UnitSystem } from './units';
import { bang } from './sound';
import Cutaway from './components/Cutaway';
import Gauges from './components/Gauges';
import FlightView from './components/FlightView';
import Results from './components/Results';
import Charts from './components/Charts';
import Export, { download, safeName } from './components/Export';
import { AdvancedPanel, PresetPicker, SimplePanel } from './components/Panels';

const PIN_COLORS = ['#8fb35a', '#5aa9b3', '#c38bff', '#d9483b', '#e8e2cc'];
const LS_CUSTOM = 'balisim.custom.v1';
const LS_PREFS = 'balisim.prefs.v1';
const SPEEDS = [
  { key: 'speed_fast', ms: 1500 },
  { key: 'speed_normal', ms: 4000 },
  { key: 'speed_slow', ms: 9000 },
  { key: 'speed_ultra', ms: 20000 },
];

type Phase = 'idle' | 'interior' | 'hold' | 'flight' | 'done';
interface Pin { color: string; name: string; result: ScenarioResult; scenario: ScenarioInput }

function readLS<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function writeLS(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

function sampleAt(samples: Sample[], t: number): Sample {
  if (t <= samples[0].t) return samples[0];
  const last = samples[samples.length - 1];
  if (t >= last.t) return last;
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (samples[m].t < t) lo = m; else hi = m; }
  const a = samples[lo], b = samples[hi];
  const f = (t - a.t) / (b.t - a.t || 1);
  const o = {} as Sample;
  (Object.keys(a) as (keyof Sample)[]).forEach((k) => { o[k] = a[k] + (b[k] - a[k]) * f; });
  return o;
}

export default function App() {
  const prefs = readLS(LS_PREFS, { lang: 'fr' as Lang, units: 'metric' as UnitSystem, mode: 'simple' as 'simple' | 'advanced', speed: 1, sound: true });
  const [lang, setLang] = useState<Lang>(prefs.lang);
  const [units, setUnits] = useState<UnitSystem>(prefs.units);
  const [mode, setMode] = useState<'simple' | 'advanced'>(prefs.mode);
  const [speed, setSpeed] = useState(prefs.speed);
  const [sound, setSound] = useState(prefs.sound);
  const t = useMemo(() => makeT(lang), [lang]);

  const [lib, setLib] = useState<Library | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [custom, setCustom] = useState<Preset[]>(() => readLS<Preset[]>(LS_CUSTOM, []).map((p) => ({ ...p, scenario: normalizeScenario(p.scenario) })));
  const [presetId, setPresetId] = useState('40-pak-lisse');
  const [base, setBase] = useState<ScenarioInput | null>(null);
  const [s, setS] = useState<ScenarioInput | null>(null);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [resultScenario, setResultScenario] = useState<ScenarioInput | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [flightView, setFlightView] = useState<'target' | 'max'>('target');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [sweep, setSweep] = useState<{ name: string; color: string; points: [number, number][] }[]>([]);
  const sweepFor = useRef<ScenarioResult | null>(null);
  const [saveName, setSaveName] = useState('');

  // animation
  const [phase, setPhase] = useState<Phase>('idle');
  const [tSim, setTSim] = useState(0);
  const [flightProg, setFlightProg] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const anim = useRef({ t0: 0, t1: 0, elapsed: 0, banged: false });

  useEffect(() => writeLS(LS_PREFS, { lang, units, mode, speed, sound }), [lang, units, mode, speed, sound]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const pick = useCallback((p: Preset) => {
    setPresetId(p.id);
    setBase(p.scenario);
    setS(p.scenario);
  }, []);

  useEffect(() => {
    loadLibrary()
      .then((l) => {
        setLib(l);
        const p = l.presets.find((x) => x.id === '40-pak-lisse') ?? l.presets[0];
        pick(p);
        runScenario(p.scenario).then((r) => { setResult(r); setResultScenario(p.scenario); setPhase('done'); });
      })
      .catch((e) => setLoadError(String(e)));
  }, [pick]);

  const fire = useCallback(async () => {
    if (!s) return;
    setBusy(true);
    setStatus(t('calc'));
    const t0 = performance.now();
    const r = await runScenario(s);
    const ms = performance.now() - t0;
    setBusy(false);
    setResult(r);
    setResultScenario(s);
    setStatus(r.ok ? t('computed_in', { ms: fmt(ms, 0, lang) }) : (r.error ?? ''));
    if (!r.ok) { setPhase('done'); return; }
    anim.current = { t0: performance.now(), t1: 0, elapsed: 0, banged: false };
    setPaused(false);
    setTSim(0);
    setFlightProg(0);
    setPhase('interior');
  }, [s, t, lang]);

  // Animation loop
  useEffect(() => {
    if (!result?.ok || phase === 'idle' || phase === 'done') return;
    let raf = 0;
    const dur = SPEEDS[speed].ms;
    const tick = (now: number) => {
      const a = anim.current;
      if (phase === 'interior') {
        if (!paused) a.elapsed = now - a.t0;
        const f = Math.min(1, a.elapsed / dur);
        setTSim(f * result.interior.barrel_time);
        if (f >= 1) {
          if (!a.banged && sound) bang(result.muzzle?.energy ?? 0, result.interior.muzzle_pressure / 1e6);
          a.banged = true;
          a.t1 = now;
          setPhase('hold');
          return;
        }
      } else if (phase === 'hold') {
        if (now - a.t1 > 700) { a.t1 = now; setPhase('flight'); return; }
      } else if (phase === 'flight') {
        const pts = flightView === 'target' && result.hit ? result.hit.points : result.max_range_points;
        const tof = pts[pts.length - 1].t;
        const fd = Math.min(4500, Math.max(1500, tof * 1000));
        const f = Math.min(1, (now - a.t1) / fd);
        setFlightProg(f);
        if (f >= 1) { setPhase('done'); setFlightProg(null); return; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, paused, result, speed, sound, flightView]);

  const togglePause = () => {
    if (phase !== 'interior') return;
    if (!paused) setPaused(true);
    else { anim.current.t0 = performance.now() - anim.current.elapsed; setPaused(false); }
  };
  const scrub = (frac: number) => {
    if (!result?.ok) return;
    if (phase !== 'interior') setPhase('interior');
    setPaused(true);
    anim.current.elapsed = frac * SPEEDS[speed].ms;
    anim.current.banged = true;
    setTSim(frac * result.interior.barrel_time);
  };

  const sample: Sample | null = result?.ok
    ? phase === 'interior' ? sampleAt(result.interior.samples, tSim) : result.interior.samples[result.interior.samples.length - 1]
    : null;
  const exited = phase !== 'interior' && phase !== 'idle';
  const slowLabel = result?.ok && phase === 'interior' ? `${t('slow')} ×${fmt(SPEEDS[speed].ms / 1000 / result.interior.barrel_time, 0, lang)}` : '';

  const keep = () => {
    if (!result?.ok || !resultScenario) return;
    const color = PIN_COLORS[pins.length % PIN_COLORS.length];
    setPins((p) => [...p, { color, name: result.name, result, scenario: resultScenario }].slice(-5));
  };

  const needSweep = useCallback(async () => {
    if (!result?.ok || !resultScenario || sweepFor.current === result) return;
    sweepFor.current = result;
    const pts: [number, number][] = [];
    const b = resultScenario.barrel_mm;
    for (const k of [0.4, 0.55, 0.7, 0.85, 1.0, 1.15, 1.3, 1.5, 1.7]) {
      const r = await runScenario({ ...resultScenario, barrel_mm: Math.round(b * k), env: { ...resultScenario.env, target_m: 10 } });
      if (r.ok) pts.push([Math.round(b * k), r.interior.muzzle_velocity]);
    }
    setSweep([{ name: result.name, color: '#e0a43a', points: pts }]);
  }, [result, resultScenario]);

  const saveCustom = () => {
    if (!s) return;
    const name = saveName.trim() || `${s.name} (perso)`;
    const p: Preset = { id: `custom-${Date.now()}`, family: 'custom', reference: '', ref_velocity: 0, ref_pressure: 0, scenario: { ...s, name } };
    const next = [...custom, p];
    setCustom(next);
    writeLS(LS_CUSTOM, next);
    setPresetId(p.id);
    setStatus(t('saved'));
  };
  const importFile = (f: File) => {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const data = JSON.parse(String(rd.result));
        const raw = data.config ?? data.scenario ?? data;
        if (!raw.layout || !raw.charge_g || !raw.name) throw new Error('format');
        const scen: ScenarioInput = normalizeScenario(raw);
        const p: Preset = { id: `custom-${Date.now()}`, family: 'custom', reference: '', ref_velocity: 0, ref_pressure: 0, scenario: scen };
        const next = [...custom, p];
        setCustom(next);
        writeLS(LS_CUSTOM, next);
        pick(p);
      } catch { setStatus('Fichier invalide / invalid file'); }
    };
    rd.readAsText(f);
  };

  if (loadError) return <div className="loading err">{loadError}</div>;
  if (!lib || !s || !base) return <div className="loading">{t('loading')}</div>;

  const preset = [...lib.presets, ...custom].find((p) => p.id === presetId);
  const shownScenario = phase === 'interior' && resultScenario ? resultScenario : s;

  return (
    <div className="app">
      <header>
        <div className="logo">BALI<span>SIM</span></div>
        <div className="sub">{t('app_sub')}</div>
        <div className="toggles">
          <div className="seg">
            <button className={mode === 'simple' ? 'on' : ''} onClick={() => setMode('simple')}>{t('mode_simple')}</button>
            <button className={mode === 'advanced' ? 'on' : ''} onClick={() => setMode('advanced')}>{t('mode_advanced')}</button>
          </div>
          <div className="seg">
            <button className={units === 'metric' ? 'on' : ''} onClick={() => setUnits('metric')}>{t('units_metric')}</button>
            <button className={units === 'imperial' ? 'on' : ''} onClick={() => setUnits('imperial')}>{t('units_imperial')}</button>
          </div>
          <div className="seg">
            <button className={lang === 'fr' ? 'on' : ''} onClick={() => setLang('fr')}>FR</button>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
          </div>
        </div>
      </header>
      <div className="safety">{t('safety')}</div>
      <div className="layout">
        <aside>
          <PresetPicker lib={lib} custom={custom} presetId={presetId} onPick={pick} t={t} />
          {preset?.reference && <div className="ref">{t('reference')} : {preset.reference}</div>}
          {mode === 'simple' ? (
            <SimplePanel s={s} base={base} set={setS} units={units} t={t} lang={lang} />
          ) : (
            <AdvancedPanel s={s} set={setS} lib={lib} units={units} t={t} />
          )}
          <div className="save">
            <input type="text" placeholder={t('cfg_name')} value={saveName} onChange={(e) => setSaveName(e.target.value)} />
            <button onClick={saveCustom}>{t('save_cfg')}</button>
            <label className="filebtn">{t('load_cfg')}<input type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} /></label>
            <button onClick={() => download(`${safeName(s.name)}.balisim.json`, JSON.stringify(s, null, 2), 'application/json')}>JSON</button>
          </div>
          <p className="engine">{engineKind === 'wasm' ? t('engine_wasm') : t('engine_dev')}</p>
        </aside>
        <main>
          <section className="card stage">
            <h3>{shownScenario.name}</h3>
            <Cutaway scenario={shownScenario} result={result} sample={sample} progress={result?.ok ? tSim / result.interior.barrel_time : 0} playing={phase === 'interior' || phase === 'hold'} exited={exited} slowLabel={slowLabel} t={t} lang={lang} />
            <input className="scrub" type="range" min={0} max={1000} value={result?.ok ? Math.round((phase === 'interior' ? tSim / result.interior.barrel_time : 1) * 1000) : 0} onChange={(e) => scrub(Number(e.target.value) / 1000)} aria-label="time" />
            <div className="firebar">
              <button className="fire" onClick={fire} disabled={busy}>{t('fire')}</button>
              <button onClick={togglePause} disabled={phase !== 'interior'}>{paused ? t('play') : t('pause')}</button>
              <label>{t('slow')}
                <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                  {SPEEDS.map((sp, i) => <option key={sp.key} value={i}>{t(sp.key)}</option>)}
                </select>
              </label>
              <label><input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> {t('sound')}</label>
              <button onClick={keep} disabled={!result?.ok}>{t('keep')}</button>
              <span className="status">{status}</span>
            </div>
          </section>

          <Gauges sample={sample} result={result} units={units} t={t} />

          <section className="card stage">
            <h3>{t('flight')}</h3>
            <div className="tabs">
              <button className={flightView === 'target' ? 'on' : ''} onClick={() => setFlightView('target')}>{t('view_target')}</button>
              <button className={flightView === 'max' ? 'on' : ''} onClick={() => setFlightView('max')}>{t('view_max')}</button>
            </div>
            <FlightView result={result} pins={pins.map((p) => ({ color: p.color, result: p.result }))} view={flightView} progress={phase === 'flight' ? flightProg : phase === 'interior' || phase === 'hold' ? 0 : null} units={units} t={t} lang={lang} />
          </section>

          {result && resultScenario && <Results r={result} s={resultScenario} units={units} simple={mode === 'simple'} t={t} lang={lang} />}

          <Charts current={result?.ok ? result : null} pins={pins} units={units} t={t} barrelSweep={sweep} onNeedSweep={needSweep} />

          <section className="card">
            <h3>{t('compare')}</h3>
            {pins.length === 0 ? <p className="note">{t('compare_empty')}</p> : (
              <div className="scroll">
                <table className="grid">
                  <thead><tr><th></th><th>{t('velocity')}</th><th>{t('energy')}</th><th>{t('p_max')}</th><th>{t('burnt')}</th><th>{t('r_target')}</th><th>{t('max_range')}</th></tr></thead>
                  <tbody>
                    {[...pins, ...(result?.ok && resultScenario ? [{ color: '#e0a43a', name: `${t('current')} — ${result.name}`, result, scenario: resultScenario }] : [])].map((p, i) => {
                      const hilo = p.scenario.layout === 'high_low';
                      const pm = (hilo ? p.result.interior.p_high_max : p.result.interior.p_breech_max) / 1e6;
                      return (
                        <tr key={i}>
                          <td><span className="swatch" style={{ background: p.color }} />{p.name}</td>
                          <td>{fmt(toDisplay(p.result.interior.muzzle_velocity, 'velocity', units), 0, lang)} {unitLabel('velocity', units)}</td>
                          <td>{fmt(toDisplay(p.result.muzzle?.energy ?? 0, 'energy', units), 0, lang)} {unitLabel('energy', units)}</td>
                          <td>{fmt(toDisplay(pm, 'pressure', units), hilo ? 1 : 0, lang)} {unitLabel('pressure', units)}</td>
                          <td>{fmt(p.result.interior.burnt_fraction * 100, 0, lang)} %</td>
                          <td>{p.result.hit ? `${fmt(toDisplay(p.result.hit.impact.velocity, 'velocity', units), 0, lang)} ${unitLabel('velocity', units)} · ${fmt(toDisplay(p.result.hit.impact.energy, 'energy', units), 0, lang)} ${unitLabel('energy', units)}` : '—'}</td>
                          <td>{fmt(toDisplay(p.result.max_range_m, 'distance_m', units), 0, lang)} {unitLabel('distance_m', units)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {pins.length > 0 && <button style={{ marginTop: 8 }} onClick={() => setPins([])}>{t('clear')}</button>}
          </section>

          {result?.ok && resultScenario && <Export r={result} s={resultScenario} units={units} t={t} lang={lang} />}

          <section className="card note">
            <p>{t('about')}</p>
            <p>BALISIM — MIT · <a href="https://github.com/Kitcut40/balisim">github.com/Kitcut40/balisim</a></p>
          </section>
        </main>
      </div>
    </div>
  );
}
