//! Offline BIP 93 backup operations. Experimental; not audited for real funds.
//!
//! Inputs are strict BIP 93 strings. Presentation spacing belongs to the UI.
//! Secret-bearing types redact Debug and require explicit export. Owned buffers
//! are zeroized on drop; this is not a guarantee that every machine copy is erased.

mod checksum;
mod sharing;
mod types;

pub use sharing::{
    add_symbols, derive_share, generate, generate_share, interpolation_weights, multiply_symbols,
    recover, split,
};
pub use types::{Codex32, Error, Identifier, Metadata, Seed, ShareIndex};
pub use zeroize::Zeroizing;
