// Engine adapter: WebAssembly build in production (built by CI from crates/wasm),
// native dev bridge in `npm run dev` when the WebAssembly package is absent.
import { normalizeScenario, type Library, type ScenarioInput, type ScenarioResult } from './types';

type Engine = { run: (json: string) => string | Promise<string>; library: () => string | Promise<string> };

let engine: Engine | null = null;
export let engineKind: 'wasm' | 'native-dev' = 'wasm';

const wasmModules = import.meta.glob('./engine/pkg/balisim_wasm.js');

export async function initEngine(): Promise<void> {
  const loader = wasmModules['./engine/pkg/balisim_wasm.js'];
  if (loader) {
    const m: any = await loader();
    await m.default();
    engine = { run: m.run_scenario, library: m.library };
    engineKind = 'wasm';
    return;
  }
  if (import.meta.env.DEV) {
    engine = {
      run: async (json) => (await fetch('/__native/run', { method: 'POST', body: json })).text(),
      library: async () => (await fetch('/__native/library')).text(),
    };
    engineKind = 'native-dev';
    return;
  }
  throw new Error('Moteur WebAssembly introuvable');
}

export async function loadLibrary(): Promise<Library> {
  if (!engine) await initEngine();
  const lib: Library = JSON.parse(await engine!.library());
  lib.presets = lib.presets.map((p) => ({ ...p, scenario: normalizeScenario(p.scenario) }));
  return lib;
}

export async function runScenario(s: ScenarioInput): Promise<ScenarioResult> {
  if (!engine) await initEngine();
  return JSON.parse(await engine!.run(JSON.stringify(s)));
}
