import type { Engine } from './practice';
let pending: Promise<Engine> | undefined;
export function loadEngine(): Promise<Engine> {
  pending ??= Promise.all([
    import('./wasm/codex32_wasm.js'),
    import('./wasm/codex32_wasm_bg.wasm?url'),
  ])
    .then(async ([engine, asset]) => {
      await engine.default({ module_or_path: asset.default });
      return engine;
    })
    .catch((error) => {
      pending = undefined;
      throw error;
    });
  return pending;
}
