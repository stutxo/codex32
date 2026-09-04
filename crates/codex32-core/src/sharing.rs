use crate::{
    Codex32, Error, Identifier, Metadata, Seed, ShareIndex,
    types::{check_seed_len, fe, threshold},
};
use rand_core::TryCryptoRng;
use zeroize::Zeroizing;

const INDICES: &[u8; 31] = b"acdefghjklmnpqrtuvwxyz023456789";

fn validate(shares: &[Codex32], allow_secret: bool) -> Result<Metadata, Error> {
    let first = shares
        .first()
        .ok_or(Error::ShareCount {
            required: 2,
            provided: 0,
        })?
        .metadata;
    if first.threshold == 0 {
        return Err(Error::ExpectedShare);
    }
    if shares.len() != usize::from(first.threshold) {
        return Err(Error::ShareCount {
            required: usize::from(first.threshold),
            provided: shares.len(),
        });
    }
    let mut seen = 0u32;
    for share in shares {
        let m = share.metadata;
        if !allow_secret && m.index.is_secret() {
            return Err(Error::ExpectedShare);
        }
        if m.threshold != first.threshold
            || m.identifier != first.identifier
            || m.seed_bytes != first.seed_bytes
        {
            return Err(Error::MismatchedShares);
        }
        let bit = 1u32 << m.index.0;
        if seen & bit != 0 {
            return Err(Error::DuplicateIndex);
        }
        seen |= bit;
    }
    Ok(first)
}

// Fixed number of bit operations; no secret-indexed multiplication tables.
// This does not claim end-to-end constant-time execution for the library.
fn multiply(mut a: u8, b: u8) -> u8 {
    let mut result = 0;
    for i in 0..5 {
        result ^= a & 0u8.wrapping_sub((b >> i) & 1);
        let high = (a >> 4) & 1;
        a = (a << 1) ^ (41 & 0u8.wrapping_sub(high));
    }
    result
}

fn interpolate(shares: &[Codex32], at: ShareIndex) -> Codex32 {
    if let Some(existing) = shares.iter().find(|s| s.metadata.index == at) {
        return existing.clone();
    }
    let mut metadata = shares[0].metadata;
    metadata.index = at;
    let mut payload = Zeroizing::new(vec![0; shares[0].payload.len()]);
    for (i, share) in shares.iter().enumerate() {
        // Indices and weights are public. Only payload multiplication handles secret data.
        let (mut numerator, mut denominator) = (fe(1), fe(1));
        for (j, other) in shares.iter().enumerate() {
            if i != j {
                numerator *= fe(at.0 ^ other.metadata.index.0);
                denominator *= fe(share.metadata.index.0 ^ other.metadata.index.0);
            }
        }
        let weight = (numerator / denominator).to_u8();
        for (output, &symbol) in payload.iter_mut().zip(share.payload.iter()) {
            *output ^= multiply(symbol, weight);
        }
    }
    Codex32 { metadata, payload }
}

/// Recover the encoded secret from exactly the declared threshold of distinct shares.
/// A valid checksum does not authenticate a share set or the recovered wallet.
pub fn recover(shares: &[Codex32]) -> Result<Codex32, Error> {
    validate(shares, false)?;
    Ok(interpolate(shares, ShareIndex::SECRET))
}

/// Derive a fresh non-S share from exactly threshold-many compatible inputs.
/// Inputs may include an encoded secret with a nonzero threshold, as in BIP 93.
pub fn derive_share(shares: &[Codex32], index: ShareIndex) -> Result<Codex32, Error> {
    validate(shares, true)?;
    if index.is_secret() {
        return Err(Error::ExpectedShare);
    }
    if shares.iter().any(|s| s.metadata.index == index) {
        return Err(Error::DuplicateIndex);
    }
    Ok(interpolate(shares, index))
}
/// Generate one independently random initial share for BIP 93's fresh-secret
/// construction. Exactly `k` such shares with compatible metadata and distinct
/// indices define a uniformly random seed; contributors must commit before
/// revealing if any participant could otherwise choose its share adaptively.
pub fn generate_share<R: TryCryptoRng + ?Sized>(
    seed_bytes: usize,
    identifier: Identifier,
    k: u8,
    index: ShareIndex,
    rng: &mut R,
) -> Result<Codex32, Error> {
    check_seed_len(seed_bytes)?;
    threshold(k)?;
    if k == 0 {
        return Err(Error::Threshold);
    }
    if index.is_secret() {
        return Err(Error::ExpectedShare);
    }
    let mut payload = Zeroizing::new(vec![0; (seed_bytes * 8).div_ceil(5)]);
    rng.try_fill_bytes(&mut payload)
        .map_err(|_| Error::Randomness)?;
    for symbol in payload.iter_mut() {
        *symbol &= 31;
    }
    Ok(Codex32 {
        metadata: Metadata {
            threshold: k,
            identifier,
            index,
            seed_bytes,
        },
        payload,
    })
}

fn check_backup(k: u8, count: usize) -> Result<(), Error> {
    threshold(k)?;
    if k == 0 {
        return Err(Error::Threshold);
    }
    if !(usize::from(k)..=31).contains(&count) {
        return Err(Error::BackupSize);
    }
    Ok(())
}

/// Split an existing seed using BIP 93's existing-secret construction.
/// The caller must supply a cryptographic random source, including on WASM.
pub fn split<R: TryCryptoRng + ?Sized>(
    seed: &Seed,
    identifier: Identifier,
    k: u8,
    count: usize,
    rng: &mut R,
) -> Result<Vec<Codex32>, Error> {
    check_backup(k, count)?;
    let mut secret = Codex32::from_seed(seed, identifier);
    secret.metadata.threshold = k;
    let mut inputs = Vec::with_capacity(usize::from(k));
    inputs.push(secret);
    for &index in INDICES.iter().take(usize::from(k) - 1) {
        let mut payload = Zeroizing::new(vec![0; inputs[0].payload.len()]);
        rng.try_fill_bytes(&mut payload)
            .map_err(|_| Error::Randomness)?;
        for symbol in payload.iter_mut() {
            *symbol &= 31;
        }
        let mut metadata = inputs[0].metadata;
        metadata.index = ShareIndex::from_char(char::from(index)).expect("fixed alphabet");
        inputs.push(Codex32 { metadata, payload });
    }
    Ok(INDICES
        .iter()
        .take(count)
        .map(|&c| {
            interpolate(
                &inputs,
                ShareIndex::from_char(char::from(c)).expect("fixed alphabet"),
            )
        })
        .collect())
}

/// Generate a fresh random seed and return only its recovery shares.
/// The secret is not logged, persisted, or returned separately.
pub fn generate<R: TryCryptoRng + ?Sized>(
    seed_bytes: usize,
    identifier: Identifier,
    k: u8,
    count: usize,
    rng: &mut R,
) -> Result<Vec<Codex32>, Error> {
    check_seed_len(seed_bytes)?;
    check_backup(k, count)?;
    let mut bytes = Zeroizing::new(vec![0; seed_bytes]);
    rng.try_fill_bytes(&mut bytes)
        .map_err(|_| Error::Randomness)?;
    split(&Seed::from_bytes(&bytes)?, identifier, k, count, rng)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn multiplication_matches_bech32_for_every_input() {
        for a in 0..32 {
            for b in 0..32 {
                assert_eq!(multiply(a, b), (fe(a) * fe(b)).to_u8());
            }
        }
    }
}
