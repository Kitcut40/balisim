import type { ScenarioInput, ScenarioResult } from '../types';
import type { T } from '../i18n';
import { fmt, fu, toDisplay, unitLabel, type UnitSystem } from '../units';

interface Props {
  r: ScenarioResult;
  s: ScenarioInput;
  units: UnitSystem;
  simple: boolean;
  t: T;
  lang: string;
}

const NINE_MM_J = 510; // 9x19 8 g at ~357 m/s, used for plain-language comparisons.

function Row({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <tr>
      <td>{k}</td>
      <td>{v}{sub ? <div className="sub">{sub}</div> : null}</td>
    </tr>
  );
}

export function warningText(code: string, value: number, t: T, lang: string): string {
  const digits = code === 'marginal_stability' || code === 'tumbling' ? 2 : 0;
  return t(`w_${code}`, { v: fmt(value, digits, lang) });
}

export default function Results({ r, s, units, simple, t, lang }: Props) {
  if (!r.ok) {
    return (
      <section className="results">
        <div className="card"><h3>{t('r_muzzle')}</h3><div className="err">{r.error}</div></div>
      </section>
    );
  }
  const ir = r.interior;
  const mz = r.muzzle!;
  const hilo = s.layout === 'high_low';
  const a = r.atmosphere.sound_speed;
  const ratio = mz.energy / NINE_MM_J;
  const plain: string[] = [t('plain_speed', { kmh: fmt(ir.muzzle_velocity * 3.6, 0, lang) })];
  plain.push(ratio >= 1 ? t('plain_compare_pistol', { x: fmt(ratio, 1, lang) }) : t('plain_less_pistol', { x: fmt(ratio * 100, 0, lang) }));
  if (r.hit) {
    plain.push(t('plain_target', { d: fu(r.hit.point.x, 'distance_m', units, 0, lang), kmh: fmt(r.hit.point.v * 3.6, 0, lang), e: fu(r.hit.impact.energy, 'energy', units, 0, lang) }));
    if (Number.isFinite(r.hit.flat_drop) && r.hit.flat_drop > 0.005) {
      plain.push(t('plain_drop', { drop: fu(r.hit.flat_drop, 'drop_m', units, 1, lang), elev: `${fmt(r.hit.elevation_deg, 2, lang)}°` }));
    }
  }
  const pMaxShown = hilo ? ir.p_low_max : ir.p_breech_max;

  return (
    <section className="results">
      <div className="card accent">
        <h3>{t('r_muzzle')}</h3>
        <div className="big">{fu(ir.muzzle_velocity, 'velocity', units, 0, lang)}</div>
        <div className="units-line">{fmt(ir.muzzle_velocity * 3.6, 0, lang)} km/h · {fmt(units === 'metric' ? ir.muzzle_velocity * 3.28084 : ir.muzzle_velocity, 0, lang)} {units === 'metric' ? 'ft/s' : 'm/s'} · Mach {fmt(ir.muzzle_velocity / a, 2, lang)}</div>
        <div className="big">{fu(mz.energy, 'energy', units, 0, lang)}</div>
        <ul className="plain">{plain.map((p, i) => <li key={i}>{p}</li>)}</ul>
        {!simple && (
          <table className="kv"><tbody>
            <Row k={t('momentum')} v={`${fmt(mz.momentum, 2, lang)} kg·m/s`} />
            <Row k={t('energy_density')} v={`${fmt(mz.energy_density, 1, lang)} J/cm²`} />
          </tbody></table>
        )}
      </div>

      <div className="card">
        <h3>{t('r_target')}</h3>
        {r.hit ? (
          <>
            <div className="big">{fu(r.hit.impact.energy, 'energy', units, 0, lang)}</div>
            <table className="kv"><tbody>
              <Row k={t('velocity')} v={fu(r.hit.impact.velocity, 'velocity', units, 0, lang)} />
              <Row k={t('energy_density')} v={`${fmt(r.hit.impact.energy_density, 1, lang)} J/cm²`} />
              <Row k={t('tof')} v={`${fmt(r.hit.point.t * 1000, 0, lang)} ms`} />
              <Row k={t('elevation')} v={`${fmt(r.hit.elevation_deg, 2, lang)}° · ${fmt(r.hit.elevation_deg * 17.7778, 1, lang)} mil · ${fmt(r.hit.elevation_deg * 60, 0, lang)} MOA`} />
              <Row k={t('flat_drop')} v={fu(r.hit.flat_drop, 'drop_m', units, 1, lang)} />
              {!simple && <Row k={t('drift')} v={fu(r.hit.point.z, 'drop_m', units, 1, lang)} />}
              <Row k={t('damage')} v={`${fmt(r.hit.impact.game_damage, 0, lang)} / 100`} sub={!simple ? (r.hit.impact.penetrating ? t('penetrating') : `${t('blunt')} : ${fmt(r.hit.impact.blunt_criterion, 2, lang)}`) : undefined} />
            </tbody></table>
          </>
        ) : (
          <div className="err">{t('out_of_range')}</div>
        )}
      </div>

      <div className="card">
        <h3>{t('r_interior')}</h3>
        <table className="kv"><tbody>
          {hilo ? (
            <>
              <Row k={t('p_cart')} v={fu(ir.p_high_max / 1e6, 'pressure', units, 1, lang)} sub={`${fmt(ir.p_high_max / 1e5, 0, lang)} bar`} />
              <Row k={t('p_chamber')} v={fu(ir.p_low_max / 1e6, 'pressure', units, 2, lang)} sub={`${fmt(ir.p_low_max / 1e5, 1, lang)} bar`} />
            </>
          ) : (
            <Row k={t('p_max')} v={fu(pMaxShown / 1e6, 'pressure', units, 0, lang)} sub={s.pmax_mpa > 0 ? `${fmt((pMaxShown / 1e6 / s.pmax_mpa) * 100, 0, lang)} % Pmax (${fmt(toDisplay(s.pmax_mpa, 'pressure', units), 0, lang)} ${unitLabel('pressure', units)})` : `${fmt(pMaxShown / 1e5, 0, lang)} bar`} />
          )}
          <Row k={t('barrel_time')} v={`${fmt(ir.barrel_time * 1e3, 3, lang)} ms`} />
          <Row k={t('burnt')} v={`${fmt(ir.burnt_fraction * 100, 0, lang)} %`} />
          {!simple && <Row k={t('fill')} v={`${fmt(ir.fill_ratio * 100, 0, lang)} %`} />}
          {!simple && <Row k={t('muzzle_p')} v={fu(ir.muzzle_pressure / 1e6, 'pressure', units, 1, lang)} />}
          {!simple && ir.muzzle_spin > 0 && <Row k={t('spin')} v={`${fmt((ir.muzzle_spin * 60) / (2 * Math.PI), 0, lang)} tr/min`} />}
          {!simple && <Row k={t('chem')} v={fu(ir.chemical_energy, 'energy', units, 0, lang)} />}
          <Row k={t('efficiency')} v={`${fmt(ir.efficiency * 100, 1, lang)} %`} />
        </tbody></table>
      </div>

      <div className="card">
        <h3>{t('r_range')}</h3>
        <table className="kv"><tbody>
          <Row k={t('max_range')} v={fu(r.max_range_m, 'distance_m', units, 0, lang)} />
          <Row k={t('best_angle')} v={`${fmt(r.max_range_deg, 1, lang)}°`} />
          {!simple && <Row k={t('apex')} v={fu(r.max_range_apex, 'distance_m', units, 0, lang)} />}
          {!simple && <Row k={t('impact_v')} v={fu(r.max_range_impact_v, 'velocity', units, 0, lang)} />}
          <Row k={t('recoil_e')} v={fu(r.recoil?.energy ?? 0, 'energy', units, 1, lang)} />
          {!simple && <Row k={t('recoil_v')} v={`${fmt(r.recoil?.velocity ?? 0, 2, lang)} m/s`} />}
          <Row k={t('stability')} v={`${t('stab_mode_' + (r.stability?.mode ?? 'spin'))}${r.stability?.sg ? ` (Sg ${fmt(r.stability.sg, 2, lang)})` : ''}`} />
        </tbody></table>
      </div>

      {r.warnings.length > 0 && (
        <div className="card warnings">
          {r.warnings.map((w, i) => (
            <div key={i} className={`warn ${w.code === 'overpressure' || w.code === 'tumbling' || w.code === 'extreme_pressure' ? 'danger' : ''}`}>⚠ {warningText(w.code, w.value, t, lang)}</div>
          ))}
        </div>
      )}
    </section>
  );
}
