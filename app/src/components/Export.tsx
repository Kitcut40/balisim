import { useState } from 'react';
import type { ScenarioInput, ScenarioResult } from '../types';
import type { T } from '../i18n';
import { fmt, toDisplay, unitLabel, type UnitSystem } from '../units';

/** Ammunition profile consumed by the game runtime (format "balisim-ammo", version 1). */
export function ammoProfile(r: ScenarioResult, s: ScenarioInput) {
  const mass = s.proj_mass_g / 1000;
  return {
    format: 'balisim-ammo',
    version: 1,
    generator: 'BALISIM 0.1',
    name: r.name,
    projectile: {
      mass_kg: +mass.toFixed(6),
      diameter_m: +(s.bore_mm / 1000).toFixed(5),
      length_m: +(s.proj_len_mm / 1000).toFixed(5),
      drag_model: r.flight_drag,
      cd_vs_mach: r.cd_curve,
      stability: r.stability,
      spin_rpm: +((r.interior.muzzle_spin * 60) / (2 * Math.PI)).toFixed(0),
      backspin_rpm: s.backspin_rpm,
    },
    muzzle: {
      velocity_ms: +r.interior.muzzle_velocity.toFixed(2),
      energy_j: +(r.muzzle?.energy ?? 0).toFixed(1),
      peak_pressure_mpa: +((s.layout === 'high_low' ? r.interior.p_low_max : r.interior.p_breech_max) / 1e6).toFixed(2),
      barrel_time_ms: +(r.interior.barrel_time * 1e3).toFixed(4),
      powder_burnt_pct: +(r.interior.burnt_fraction * 100).toFixed(1),
    },
    recoil: { weapon_mass_kg: s.weapon_kg, velocity_ms: +(r.recoil?.velocity ?? 0).toFixed(3), energy_j: +(r.recoil?.energy ?? 0).toFixed(2) },
    max_range: { distance_m: +r.max_range_m.toFixed(1), angle_deg: +r.max_range_deg.toFixed(2), time_of_flight_s: +r.max_range_tof.toFixed(2) },
    environment: { altitude_m: s.env.altitude_m, temperature_c: s.env.temp_c, air_density: +r.atmosphere.density.toFixed(4), speed_of_sound_ms: +r.atmosphere.sound_speed.toFixed(1) },
    game_effects: {
      description: 'Règles de jeu BALISIM (pas des données médicales). severity = 1 - exp(-E_impact / 120 J) pour un projectile non pénétrant, 1 - exp(-E / 800 J) pour une balle. Chaque effet varie linéairement entre min (severity 0) et max (severity 1).',
      severity_energy_scale_j: s.drag.kind === 'g1' || s.drag.kind === 'g7' ? 800 : 120,
      head: { unconscious_if_severity_at_least: 0.25, unconscious_s: [5, 30], dazed_s: [1, 4] },
      torso: { hp_loss_pct: [10, 60], vision_blur_s: [1, 8], move_slow_pct: [15, 60], move_slow_s: [2, 10] },
      groin: { hp_loss_pct_multiplier: 1.15, same_as: 'torso' },
      legs: { move_slow_pct: [25, 80], move_slow_s: [3, 15], no_sprint_s: [2, 20] },
      arms: { weapon_disabled_s: [2, 15], drops_weapon_if_severity_at_least: 0.6 },
      at_target: r.hit?.zones ?? null,
    },
    target: r.hit ? { distance_m: s.env.target_m, elevation_deg: +r.hit.elevation_deg.toFixed(3), velocity_ms: +r.hit.impact.velocity.toFixed(2), energy_j: +r.hit.impact.energy.toFixed(1), energy_density_j_cm2: +r.hit.impact.energy_density.toFixed(2), blunt_criterion: +r.hit.impact.blunt_criterion.toFixed(3), game_damage: +r.hit.impact.game_damage.toFixed(1) } : null,
    table_flat_fire: r.table.map((x) => ({ distance_m: x.distance, time_s: +x.time.toFixed(4), velocity_ms: +x.velocity.toFixed(2), energy_j: +x.energy.toFixed(1), drop_m: +x.drop.toFixed(4), drift_m: +x.drift.toFixed(4) })),
    config: s,
  };
}

export function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const safeName = (n: string) => n.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 60);

export default function Export({ r, s, units, t, lang }: { r: ScenarioResult; s: ScenarioInput; units: UnitSystem; t: T; lang: string }) {
  const [msg, setMsg] = useState('');
  const rows = r.table;
  const shown = rows.length > 60 ? rows.filter((_, i) => i % Math.ceil(rows.length / 60) === 0) : rows;
  const json = () => JSON.stringify(ammoProfile(r, s), null, 2);
  return (
    <section className="card">
      <h3>{t('export')}</h3>
      <p className="note">{t('export_note')}</p>
      <div className="row">
        <button onClick={async () => { try { await navigator.clipboard.writeText(json()); setMsg(t('copy_ok')); } catch { setMsg('—'); } }}>{t('copy_json')}</button>
        <button onClick={() => download(`${safeName(r.name)}.balisim-ammo.json`, json(), 'application/json')}>{t('download_json')}</button>
        <button onClick={() => download(`${safeName(r.name)}.csv`, 'distance_m;temps_s;vitesse_ms;energie_J;chute_m;derive_m;mach\n' + rows.map((x) => [x.distance, x.time.toFixed(4), x.velocity.toFixed(2), x.energy.toFixed(1), x.drop.toFixed(4), x.drift.toFixed(4), x.mach.toFixed(3)].join(';')).join('\n'), 'text/csv')}>{t('download_csv')}</button>
        <span className="status">{msg}</span>
      </div>
      <h3 style={{ marginTop: 14 }}>{t('table')}</h3>
      <div className="scroll">
        <table className="grid">
          <thead><tr>
            <th>{t('t_dist')} ({unitLabel('distance_m', units)})</th><th>{t('t_time')} (s)</th><th>{t('t_vel')} ({unitLabel('velocity', units)})</th>
            <th>{t('t_energy')} ({unitLabel('energy', units)})</th><th>{t('t_drop')} ({unitLabel('drop_m', units)})</th><th>{t('t_drift')} ({unitLabel('drop_m', units)})</th><th>{t('t_mach')}</th>
          </tr></thead>
          <tbody>
            {shown.map((x) => (
              <tr key={x.distance}>
                <td>{fmt(toDisplay(x.distance, 'distance_m', units), 0, lang)}</td>
                <td>{fmt(x.time, 3, lang)}</td>
                <td>{fmt(toDisplay(x.velocity, 'velocity', units), 0, lang)}</td>
                <td>{fmt(toDisplay(x.energy, 'energy', units), 0, lang)}</td>
                <td>{fmt(toDisplay(x.drop, 'drop_m', units), 1, lang)}</td>
                <td>{fmt(toDisplay(x.drift, 'drop_m', units), 1, lang)}</td>
                <td>{fmt(x.mach, 2, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
