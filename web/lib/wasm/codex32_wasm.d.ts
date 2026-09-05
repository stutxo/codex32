/* tslint:disable */
/* eslint-disable */

/**
 * Validated backup data stays inside Rust until explicitly exported.
 */
export class Backup {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Explicit sensitive export. JavaScript copies cannot be reliably zeroized.
     */
    exportText(): string;
    constructor(encoded: string);
    readonly identifier: string;
    readonly index: string;
    readonly seedBytes: number;
    readonly threshold: number;
}

export class RecoveryWallet {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Preview an address. The index must be a JavaScript number that is a
     * finite integer from 0 through 2147483647; other values are rejected.
     */
    address(change: boolean, index: number): string;
    exportPublicState(): string;
    constructor(backup: string[], network: string);
    nextReceiveAddress(): string;
}

export function addSymbols(a: string, b: string): string;

/**
 * Educational 128-bit initial share; callers supply 26 independent uniform
 * symbols. This function does not generate randomness or provide protected storage.
 */
export function createPracticeShare(index: string, payload: string): Backup;

export function deriveBackup(input: string[], index: string): Backup;

export function interpolationWeights(input: string[], at: string): string;

export function multiplySymbols(a: string, b: string): string;

export function recoverBackup(shares: string[]): Backup;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_backup_free: (a: number, b: number) => void;
    readonly __wbg_recoverywallet_free: (a: number, b: number) => void;
    readonly addSymbols: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly backup_exportText: (a: number) => [number, number];
    readonly backup_identifier: (a: number) => [number, number];
    readonly backup_index: (a: number) => [number, number];
    readonly backup_new: (a: number, b: number) => [number, number, number];
    readonly backup_seedBytes: (a: number) => number;
    readonly backup_threshold: (a: number) => number;
    readonly createPracticeShare: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly deriveBackup: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly interpolationWeights: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly multiplySymbols: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly recoverBackup: (a: number, b: number) => [number, number, number];
    readonly recoverywallet_address: (a: number, b: number, c: any) => [number, number, number, number];
    readonly recoverywallet_exportPublicState: (a: number) => [number, number, number, number];
    readonly recoverywallet_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly recoverywallet_nextReceiveAddress: (a: number) => [number, number];
    readonly rustsecp256k1_v0_10_0_default_error_callback_fn: (a: number, b: number) => void;
    readonly rustsecp256k1_v0_10_0_default_illegal_callback_fn: (a: number, b: number) => void;
    readonly rustsecp256k1_v0_10_0_context_destroy: (a: number) => void;
    readonly rustsecp256k1_v0_10_0_context_create: (a: number) => number;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
