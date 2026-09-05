# Using the experimental libraries

The workspace uses a pinned Rust compiler and checked-in Cargo.lock. Crates are local and marked `publish = false`. Application code should depend on them by path while this API is being developed.

## Backup core

The backup library has no networking, storage, browser, BDK, or operating-system randomness dependency. It consumes a caller-supplied `rand_core::TryCryptoRng` when generating secrets or shares. A failing random source returns an error and no backup result.

```rust
use codex32_core::{Codex32, recover};

// Published BIP 93 example; never fund this wallet.
let shares: Vec<Codex32> = [
    "MS12NAMEA320ZYXWVUTSRQPNMLKJHGFEDCAXRPP870HKKQRM",
    "MS12NAMECACDEFGHJKLMNPQRSTUVWXYZ023FTR2GDZMPY6PN",
].iter().map(|text| text.parse()).collect::<Result<_, _>>()?;

let encoded_secret = recover(&shares)?;
let seed = encoded_secret.secret_seed()?;
// Pass seed to the Rust wallet core; avoid copying its bytes into UI code.
```

| Operation | API |
| --- | --- |
| Parse and validate a complete string | `text.parse::<Codex32>()` |
| Inspect non-payload fields | `backup.metadata()` |
| Encode existing seed bytes | `Codex32::from_seed(&seed, identifier)` |
| Encode caller-supplied payload characters, retaining padding | `Codex32::from_payload(threshold, identifier, index, symbols)` |
| Split an existing seed | `split(&seed, identifier, threshold, count, &mut rng)` |
| Generate a seed and its shares | `generate(seed_bytes, identifier, threshold, count, &mut rng)` |
| Derive another share | `derive_share(&inputs, new_index)` |
| Inspect interpolation factors in input order | `interpolation_weights(&inputs, target_index)` |
| Perform a paper-wheel operation | `add_symbols(a, b)` / `multiply_symbols(a, b)` |
| Recover an encoded seed | `recover(&shares)` |
| Obtain a seed from an S string | `secret.secret_seed()` |
| Explicitly reveal encoded data | `backup.export()` |

`Seed::from_bytes` accepts 16–64 bytes. Encoding new seeds uses zero padding; parsing and interpolation preserve any valid existing padding. Recovery requires exactly the threshold number of distinct, compatible non-S shares. `derive_share` additionally accepts the BIP's existing-secret construction with a nonzero-threshold S input. A zero-threshold S backup is decoded directly rather than sent through share recovery.

Parsing is strict: do not silently remove spaces, repair characters, or change mixed case inside the cryptographic layer. An interface may offer a separately reviewed normalization or correction step. Export is canonical lowercase; a printed representation may use uppercase.

`from_payload` accepts exactly the payload characters, without a header or checksum. It validates the threshold, index, alphabet, case, and supported 16–64-byte layout, then calculates a checksum. It does not create entropy: initial shares must receive independent uniformly random characters from the caller. Nonzero padding is retained. The wheel arithmetic and interpolation factors use the same fixed GF(32) operations as recovery; `interpolation_weights` validates exactly threshold distinct compatible inputs, permits a nonzero-threshold S input, and can inspect an existing target's identity weights.

## Wallet core

`CodexWallet::from_seed` and `CodexWallet::restore` create a wallet on a selected test network. The current policy is BIP 86 single-key Taproot, account zero, `m/86'/1'/0'`, with receiving `/0/*` and change `/1/*` keychains. Mainnet is disabled in this prototype. Record the network and this derivation policy with a backup: BIP 93 encodes seed material, not the wallet's script or derivation policy.

At creation, record `wallet.wallet_identity().digest()` in independently trusted storage. For a subsequent recovery, call `CodexWallet::restore_verified(&backup, network, expected_digest)`: it returns `Error::IdentityMismatch` if the recovered network or descriptors differ. The expected digest must come from that original trusted record. Computing it from the incoming shares would not authenticate them. The raw `restore` method remains available for first imports without a known identity and performs no wallet authentication.

`address(change, index)` previews a public address. `next_receive_address()` reserves a new receiving index; persist `export_public_state()` before displaying the reserved address. `load(seed, network, state)` checks the expected wallet descriptors and network and reattaches the signer. Public state contains descriptors and transaction history, and remains privacy-sensitive.

Feed connected blocks using `apply_block` and pending transactions using `apply_unconfirmed_txs`, supplying `(Transaction, last_seen_timestamp)` pairs. Register an outgoing transaction and persist `export_public_state()` before broadcasting, so subsequent payment proposals do not spend its inputs again. Confirmed chain observations supersede pending state. Use `apply_evicted_txs` with `(Txid, timestamp)` pairs only when the chain backend establishes eviction; a broadcast timeout alone is insufficient. Timestamps must reflect real observations and advance monotonically. The regtest example scans all test blocks; a production application needs a chain adapter and rescan strategy. Read confirmed and total balances through their respective methods.

`prepare_payment` returns a PSBT without signing. Before `sign_payment`, the application must show and confirm the exact proposal, including destination, amount, and actual fee. A rejected signing call leaves the supplied PSBT unchanged, including any existing signatures. This does not authenticate the user's intent or establish an application's fee policy. Neither call broadcasts a transaction. The caller owns broadcast and subsequent chain updates.

Payment amounts must be positive and no greater than Bitcoin's maximum supply. Requested fee rates must be positive and at most the signer's existing `Psbt::DEFAULT_MAX_FEE_RATE` limit (25,000 sat/vB). These bounds reject overflow inputs before BDK arithmetic; the application must enforce its own much narrower fee policy for normal payments.

The Rust wallet object owns signing capability. It is not a locked key vault, and the public-state snapshot does not replace an encrypted signing-key store or a BIP 93 backup.

## JavaScript bindings

`Backup`, `recoverBackup`, and `RecoveryWallet` are exported by `codex32-wasm`. The current JS wallet wrapper exposes recovery, addresses, and public state, not transaction signing. The educational workshop also uses `createPracticeShare(index, payload)`, `deriveBackup(inputs, index)`, `interpolationWeights(inputs, target)`, `addSymbols(a, b)`, and `multiplySymbols(a, b)`. Practice construction fixes threshold 2, identifier `play`, and 26 payload characters (128-bit seed layout); it rejects S and obtains no randomness itself. The frontend supplies characters from browser cryptographic randomness. These APIs are for disposable educational sessions, not a protected key-generation interface. See `scripts/wasm-smoke.cjs` and `web/tests/workshop.test.ts` for calls exercised against actual generated bindings. Call `.free()` on WASM objects when finished; JavaScript strings and other host copies cannot be reliably erased by Rust.

`RecoveryWallet.address(change, index)` requires a JavaScript number that is a finite integer between `0` and `2147483647`. Fractions, overflow, nonfinite values, strings, and other types throw an error. Address previews do not reserve an index. This wrapper exposes raw recovery; an application needing authenticated recovery must integrate the native verified-recovery API and a trusted identity record before treating a recovered wallet as its original wallet.

Node bindings are generated by `bash scripts/test-wasm.sh`. To generate browser modules after building the WASM crate:

```sh
wasm-bindgen --target web --out-dir target/wasm-web \
  target/wasm32-unknown-unknown/debug/codex32_wasm.wasm
```

This produces library artifacts, not a hosted wallet. UniFFI/mobile bindings have not yet been implemented.
