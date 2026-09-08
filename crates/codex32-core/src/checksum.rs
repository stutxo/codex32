// Constants from BIP 93; see tests/fixtures/LICENSE-BIP93.
use bech32::{
    Checksum, Fe32, Fe1024, Hrp,
    primitives::{checksum::Engine, correction::CorrectableError, decode::InvalidResidueError},
};

/// The 13-character BIP 93 checksum for data parts of up to 93 characters.
///
/// Export exists so a [`CorrectableError`] from a failed parse can drive
/// erasure correction (characters with known locations) through the bech32
/// crate's `Corrector`, beyond the automatic substitution correction in
/// [`crate::Codex32::correct`].
pub enum Short {}

/// The 15-character BIP 93 checksum for data parts of 96 to 124 characters.
///
/// See [`Short`] for how this is used in error correction.
pub enum Long {}

impl Checksum for Short {
    type MidstateRepr = u128;
    type CorrectionField = Fe1024;
    const ROOT_GENERATOR: Fe1024 = Fe1024::new([Fe32::G, Fe32::G]);
    const ROOT_EXPONENTS: core::ops::RangeInclusive<usize> = 77..=84;
    const CODE_LENGTH: usize = 93;
    const CHECKSUM_LENGTH: usize = 13;
    const GENERATOR_SH: [u128; 5] = [
        0x19dc500ce73fde210,
        0x1bfae00def77fe529,
        0x1fbd920fffe7bee52,
        0x1739640bdeee3fdad,
        0x07729a039cfc75f5a,
    ];
    const TARGET_RESIDUE: u128 = 0x10ce0795c2fd1e62a;
}

impl Checksum for Long {
    type MidstateRepr = u128;
    type CorrectionField = Fe1024;
    const ROOT_GENERATOR: Fe1024 = Fe1024::new([Fe32::Y, Fe32::_9]);
    const ROOT_EXPONENTS: core::ops::RangeInclusive<usize> = 1020..=1027;
    const CODE_LENGTH: usize = 1023;
    const CHECKSUM_LENGTH: usize = 15;
    const GENERATOR_SH: [u128; 5] = [
        0x3d59d273535ea62d897,
        0x7a9becb6361c6c51507,
        0x543f9b7e6c38d8a2a0e,
        0x0c577eaeccf1990d13c,
        0x1887f74f8dc71b10651,
    ];
    const TARGET_RESIDUE: u128 = 0x43381e570bf4798ab26;
}

fn engine<C: Checksum<MidstateRepr = u128>>(data: &[u8]) -> Engine<C> {
    let mut engine = Engine::<C>::new();
    // The lowercase ms HRP produces the BIP's initial residue 0x23181b3.
    engine.input_hrp(Hrp::parse("ms").expect("fixed valid HRP"));
    for &symbol in data {
        engine.input_fe(Fe32::try_from(symbol).expect("validated field element"));
    }
    engine
}

pub(crate) fn valid(data: &[u8]) -> bool {
    match data.len() {
        0..=93 => *engine::<Short>(data).residue() == Short::TARGET_RESIDUE,
        96..=124 => *engine::<Long>(data).residue() == Long::TARGET_RESIDUE,
        _ => false,
    }
}

fn append_with<C: Checksum<MidstateRepr = u128>>(data: &mut Vec<u8>) {
    let mut engine = engine::<C>(data);
    engine.input_target_residue();
    for i in (0..C::CHECKSUM_LENGTH).rev() {
        data.push(((engine.residue() >> (5 * i)) & 31) as u8);
    }
}

pub(crate) fn append(data: &mut Vec<u8>) {
    if data.len() <= 80 {
        append_with::<Short>(data);
    } else {
        append_with::<Long>(data);
    }
}

/// The checksum failure of a complete data part, exposed for error correction.
///
/// `data` must contain only valid field elements. Returns `None` for the
/// never-legal data lengths 94 and 95.
pub(crate) fn residue_error(data: &[u8]) -> Option<InvalidResidueError> {
    match data.len() {
        0..=93 => Some(residue_error_with::<Short>(data)),
        96..=124 => Some(residue_error_with::<Long>(data)),
        _ => None,
    }
}

fn residue_error_with<C: Checksum<MidstateRepr = u128>>(data: &[u8]) -> InvalidResidueError {
    InvalidResidueError::new(*engine::<C>(data).residue(), C::TARGET_RESIDUE)
}

/// Attempt BCH error correction on a complete data part containing only valid
/// field elements. Returns the corrected data part on success.
///
/// The result MUST be re-validated and shown to the user for confirmation
/// before use. A successful correction is the unique closest valid string;
/// when the input carried more errors than the code can uniquely correct, that
/// closest string can differ from the intended one.
pub(crate) fn correct(data: &[u8]) -> Option<Vec<u8>> {
    match data.len() {
        0..=93 => correct_with::<Short>(data),
        96..=124 => correct_with::<Long>(data),
        _ => None,
    }
}

fn correct_with<C: Checksum<MidstateRepr = u128, CorrectionField = Fe1024>>(
    data: &[u8],
) -> Option<Vec<u8>> {
    let corrector = residue_error_with::<C>(data).correction_context::<C>()?;
    let errors: Vec<(usize, Fe32)> = corrector.bch_errors()?.collect();
    let mut corrected = data.to_vec();
    for (from_end, delta) in errors {
        // The iterator reports negative indices from the end of the string and
        // can name locations past its start (or in the HRP) for adversarial
        // input; those are uncorrectable here.
        if from_end >= corrected.len() {
            return None;
        }
        let position = corrected.len() - 1 - from_end;
        corrected[position] ^= delta.to_u8();
    }
    Some(corrected)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bech32::primitives::Field;

    fn check<C: Checksum<MidstateRepr = u128, CorrectionField = Fe1024>>() {
        C::sanity_check();
        assert_eq!(*engine::<C>(&[]).residue(), 0x23181b3);
        for exponent in C::ROOT_EXPONENTS {
            let x = C::ROOT_GENERATOR.powi(exponent as i64);
            let mut value = Fe1024::from(Fe32::P);
            for i in (0..C::CHECKSUM_LENGTH).rev() {
                let coefficient =
                    Fe32::try_from(((C::GENERATOR_SH[0] >> (5 * i)) & 31) as u8).unwrap();
                value = value * x + Fe1024::from(coefficient);
            }
            assert_eq!(value, Fe1024::from(Fe32::Q));
        }
    }

    #[test]
    fn checksum_parameters_match_their_polynomials() {
        check::<Short>();
        check::<Long>();
    }
}
