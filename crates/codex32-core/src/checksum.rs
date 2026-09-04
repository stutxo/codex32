// Constants from BIP 93; see tests/fixtures/LICENSE-BIP93.
use bech32::{Checksum, Fe32, Fe1024, Hrp, primitives::checksum::Engine};

enum Short {}
enum Long {}

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
