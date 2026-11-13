import { useState } from 'react';
import type { DragModel, Library, PowderUser, Preset, ScenarioInput } from '../types';
import type { T } from '../i18n';
import { autoDigits, fmt, fromDisplay, toDisplay, unitLabel, type Kind, type UnitSystem } from '../units';

type Setter = (s: ScenarioInput) => void;

/* ---------------- Preset picker ---------------- */

export function PresetPicker({ lib, custom, presetId, onPick, t }: { lib: Library; custom: Preset[]; presetId: string; onPick: (p: Preset) => void; t: T }) {
  const all = [...lib.presets, ...custom];
  const families = Array.from(new Set(all.map((p) => p.family)));
  return (
    <div className="field full">
      <label>{t('ammo')}</label>
      <select value={presetId} onChange={(e) => { const p = all.find((x) => x.id === e.target.value); if (p) onPick(p); }}>
        {families.map((f) => (
          <optgroup key={f} label={t('fam_' + f)}>
            {all.filter((p) => p.family === f).map((p) => <option key={p.id} value={p.id}>{p.scenario.name}</option>)}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/* ---------------- Numeric field with units ---------------- */

function NumField({ label, value, kind, units, onChange, step, unitOverride, help }: { label: string; value: number; kind: Kind; units: UnitSystem; onChange: (v: number) => void; step?: number; unitOverride?: string; help?: string }) {
  const shown = toDisplay(value, kind, units);
  const [text, setText] = useState<string | null>(null);
  const display = text ?? String(+shown.toFixed(Math.max(autoDigits(shown) + 1, 2)));
  return (
    <div className="field" title={help}>
      <label><span>{label}</span><span className="u">{unitOverride ?? unitLabel(kind, units)}</span></label>
      <input
        type="number"
        inputMode="decimal"
        step={step ?? 'any'}
        value={display}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseFloat(e.target.value.replace(',', '.'));
          if (Number.isFinite(v)) onChange(fromDisplay(v, kind, units));
        }}
        onBlur={() => setText(null)}
      />
    </div>
  );
}

function Group({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="grp" open={open}>
      <summary>{title}</summary>
      <div className="fields">{children}</div>
    </details>
  );
}

/* ---------------- Simple mode ---------------- */

export function SimplePanel({ s, base, set, units, t, lang }: { s: ScenarioInput; base: ScenarioInput; set: Setter; units: UnitSystem; t: T; lang: string }) {
  const chargePct = Math.round((s.charge_g / base.charge_g - 1) * 100);
  const barrelPct = s.barrel_mm / base.barrel_mm;
  const maxTarget = s.layout === 'high_low' ? 200 : s.env.target_m > 1000 ? 2000 : 1000;
  return (
    <div className="simple">
      <div className="slider">
        <label>{t('powder_more')} <b>{chargePct > 0 ? '+' : ''}{chargePct} %</b> <span className="u">{fmt(toDisplay(s.charge_g, 'mass_g', units), 2, lang)} {unitLabel('mass_g', units)}</span></label>
        <input type="range" min={-30} max={30} step={1} value={chargePct} onChange={(e) => set({ ...s, charge_g: base.charge_g * (1 + Number(e.target.value) / 100) })} />
      </div>
      <div className="slider">
        <label>{t('barrel_len')} <b>{fmt(toDisplay(s.barrel_mm, 'length_mm', units), units === 'metric' ? 0 : 1, lang)} {unitLabel('length_mm', units)}</b></label>
        <input type="range" min={0.5} max={1.6} step={0.01} value={barrelPct} onChange={(e) => set({ ...s, barrel_mm: Math.round(base.barrel_mm * Number(e.target.value)) })} />
      </div>
      <div className="slider">
        <label>{t('target_dist')} <b>{fmt(toDisplay(s.env.target_m, 'distance_m', units), 0, lang)} {unitLabel('distance_m', units)}</b></label>
        <input type="range" min={5} max={maxTarget} step={5} value={s.env.target_m} onChange={(e) => set({ ...s, env: { ...s.env, target_m: Number(e.target.value) } })} />
      </div>
      <div className="slider">
        <label>{t('wind')} <b>{fmt(toDisplay(s.env.wind_ms, 'velocity', units), 1, lang)} {unitLabel('velocity', units)}</b></label>
        <input type="range" min={0} max={15} step={0.5} value={s.env.wind_ms} onChange={(e) => set({ ...s, env: { ...s.env, wind_ms: Number(e.target.value), wind_clock: 3 } })} />
      </div>
    </div>
  );
}

/* ---------------- Advanced mode ---------------- */

const SHAPES = ['flake', 'sphere', 'tube', 'multi7', 'grain'] as const;
const DRAGS: DragModel['kind'][] = ['g1', 'g7', 'sphere', 'blunt_nose', 'tumbling'];

function defaultDrag(kind: DragModel['kind'], old: DragModel): DragModel {
  const surface = 'surface' in old ? old.surface : 'smooth';
  switch (kind) {
    case 'g1': return { kind, bc: 'bc' in old ? old.bc : 0.3 };
    case 'g7': return { kind, bc: 'bc' in old ? old.bc : 0.15 };
    case 'sphere': return { kind, surface, mult: 1 };
    case 'blunt_nose': return { kind, surface, mult: 1 };
    case 'tumbling': return { kind, cd: 1.0 };
    default: return old;
  }
}

export function AdvancedPanel({ s, set, lib, units, t }: { s: ScenarioInput; set: Setter; lib: Library; units: UnitSystem; t: T }) {
  const hilo = s.layout === 'high_low';
  const powder: PowderUser = s.powder ?? lib.powders.find((p) => p.id === s.powder_id) ?? lib.powders[0];
  const num = (key: keyof ScenarioInput, kind: Kind, unitOverride?: string) => (
    <NumField key={String(key)} label={t('f_' + String(key))} value={s[key] as number} kind={kind} units={units} unitOverride={unitOverride}
      onChange={(v) => set({ ...s, [key]: v })} />
  );
  const env = (key: keyof ScenarioInput['env'], kind: Kind, unitOverride?: string) => (
    <NumField key={String(key)} label={t('f_' + String(key))} value={(s.env[key] as number) ?? s.env.temp_c} kind={kind} units={units} unitOverride={unitOverride}
      onChange={(v) => set({ ...s, env: { ...s.env, [key]: v } })} />
  );
  const pw = (key: keyof PowderUser, unit: string) => (
    <NumField key={String(key)} label={t('f_' + String(key))} value={powder[key] as number} kind="raw" units={units} unitOverride={unit}
      onChange={(v) => set({ ...s, powder: { ...powder, [key]: v, id: powder.id.endsWith('-custom') ? powder.id : powder.id + '-custom', quality: 'estimated' } })} />
  );
  const drag = s.drag;
  return (
    <div className="advanced">
      <div className="field full">
        <label>{t('layout')}</label>
        <select value={s.layout} onChange={(e) => set({ ...s, layout: e.target.value as ScenarioInput['layout'] })}>
          <option value="direct">{t('layout_direct')}</option>
          <option value="high_low">{t('layout_high_low')}</option>
        </select>
      </div>
      <Group title={t('g_cartridge')} open>
        {num('case_cap_cm3', 'volume_cm3')}
        {num('case_len_mm', 'length_mm')}
        {!hilo && num('oal_mm', 'length_mm')}
        {num('charge_g', 'mass_g')}
        {num('primer_mg', 'raw', 'mg')}
        {!hilo && num('pmax_mpa', 'pressure')}
      </Group>
      {hilo && (
        <Group title={t('g_launcher')} open>
          {num('burst_mpa', 'pressure')}
          {num('vent_d_mm', 'length_mm')}
          {num('vent_cd', 'raw')}
          {num('low_vol_cm3', 'volume_cm3')}
        </Group>
      )}
      <Group title={t('g_powder')}>
        <div className="field full">
          <label><span>{t('f_powder')}</span><span className={`pill q-${powder.quality}`}>{t('q_' + powder.quality)}</span></label>
          <select value={s.powder ? '__custom' : s.powder_id} onChange={(e) => set({ ...s, powder_id: e.target.value, powder: null })}>
            {s.powder && <option value="__custom">{powder.name} ({t('q_estimated')})</option>}
            {lib.powders.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="sub">{powder.source}</div>
        </div>
        {pw('force_kj', 'kJ/kg')}
        {pw('gamma', '')}
        {pw('covolume', 'cm³/g')}
        {pw('density', 'g/cm³')}
        {pw('beta_mm', 'mm/s')}
        {pw('alpha', '')}
        {pw('web_mm', 'mm')}
        <div className="field">
          <label>{t('f_shape')}</label>
          <select value={powder.shape} onChange={(e) => set({ ...s, powder: { ...powder, shape: e.target.value as PowderUser['shape'], quality: 'estimated' } })}>
            {SHAPES.map((k) => <option key={k} value={k}>{t('shape_' + k)}</option>)}
          </select>
        </div>
      </Group>
      <Group title={t('g_projectile')} open>
        {num('proj_mass_g', 'mass_g')}
        {num('bore_mm', 'length_mm')}
        {num('proj_len_mm', 'length_mm')}
        <div className="field full">
          <label>{t('f_drag')}</label>
          <select value={drag.kind} onChange={(e) => set({ ...s, drag: defaultDrag(e.target.value as DragModel['kind'], drag) })}>
            {DRAGS.map((k) => <option key={k} value={k}>{t('drag_' + k)}</option>)}
          </select>
        </div>
        {(drag.kind === 'g1' || drag.kind === 'g7') && (
          <NumField label={`${t('f_bc')} ${drag.kind.toUpperCase()}`} value={drag.bc} kind="raw" units={units} unitOverride="lb/in²" onChange={(v) => set({ ...s, drag: { ...drag, bc: v } })} />
        )}
        {(drag.kind === 'sphere' || drag.kind === 'blunt_nose') && (
          <>
            <div className="field">
              <label>{t('f_surface')}</label>
              <select value={drag.surface} onChange={(e) => set({ ...s, drag: { ...drag, surface: e.target.value as 'smooth' | 'dimpled' } })}>
                <option value="smooth">{t('surf_smooth')}</option>
                <option value="dimpled">{t('surf_dimpled')}</option>
              </select>
            </div>
            <NumField label={t('f_mult')} value={drag.mult} kind="raw" units={units} unitOverride="×" onChange={(v) => set({ ...s, drag: { ...drag, mult: v } })} />
          </>
        )}
        {drag.kind !== 'sphere' && (
          <div className="field">
            <label>{t('f_stab')}</label>
            <select value={s.stabilisation} onChange={(e) => set({ ...s, stabilisation: e.target.value as ScenarioInput['stabilisation'] })}>
              <option value="auto">{t('stab_auto')}</option>
              <option value="fins">{t('stab_fins')}</option>
              <option value="forced_nose_first">{t('stab_forced_nose_first')}</option>
            </select>
          </div>
        )}
        {drag.kind === 'sphere' && num('backspin_rpm', 'raw', 'tr/min')}
        {num('shot_start_mpa', 'pressure')}
        {num('friction_mpa', 'pressure')}
        {num('leak_mm2', 'area_mm2')}
      </Group>
      <Group title={t('g_barrel')} open>
        {num('barrel_mm', 'length_mm')}
        {num('twist_mm', 'length_mm')}
        {num('heat_loss_pct', 'raw', '%')}
        {num('weapon_kg', 'mass_kg')}
      </Group>
      <Group title={t('g_env')} open>
        {env('target_m', 'distance_m')}
        {env('height_m', 'distance_m')}
        {env('altitude_m', 'distance_m')}
        {env('temp_c', 'temp_c')}
        {env('humidity_pct', 'raw', '%')}
        {env('wind_ms', 'velocity')}
        {env('wind_clock', 'raw', 'h')}
        {env('powder_temp_c', 'temp_c')}
      </Group>
    </div>
  );
}
