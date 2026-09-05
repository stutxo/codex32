use codex32_core::{
    Codex32, Error, Identifier, ShareIndex, add_symbols, interpolation_weights, multiply_symbols,
};
use serde::Deserialize;
use std::collections::BTreeMap;

const ALPHABET: &[u8; 32] = b"qpzry9x8gf2tvdw0s3jn54khce6mua7l";

// Published BIP 93 test vector 2. These are public examples, never wallet material.
const NAME_A: &str = "MS12NAMEA320ZYXWVUTSRQPNMLKJHGFEDCAXRPP870HKKQRM";
const NAME_C: &str = "MS12NAMECACDEFGHJKLMNPQRSTUVWXYZ023FTR2GDZMPY6PN";
const NAME_D: &str = "MS12NAMEDLL4F8JLH4E5VDVULDLFXU2JHDNLSM97XVENRXEG";
const NAME_S: &str = "MS12NAMES6XQGUZTTXKEQNJSJZV4JV3NZ5K3KWGSPHUH6EVW";

#[derive(Deserialize)]
struct Fixtures {
    seeds: Vec<SeedCase>,
    reference_cases: Vec<RecoveryCase>,
}

#[derive(Deserialize)]
struct SeedCase {
    encoded: String,
    hex: String,
}

#[derive(Deserialize)]
struct RecoveryCase {
    hex: String,
    secret: String,
    shares: Vec<String>,
}

fn fixtures() -> Fixtures {
    serde_json::from_str(include_str!("../../../tests/fixtures/bip93.json")).unwrap()
}

fn index(symbol: char) -> ShareIndex {
    ShareIndex::from_char(symbol).unwrap()
}

fn payload(k: u8, at: char, symbols: &str) -> Result<Codex32, Error> {
    Codex32::from_payload(k, "name".parse().unwrap(), index(at), symbols)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn assert_public_payload(encoded: &str, seed_bytes: usize) -> Codex32 {
    let k = encoded.as_bytes()[3] - b'0';
    let identifier: Identifier = encoded[4..8].parse().unwrap();
    let at = index(char::from(encoded.as_bytes()[8]));
    let symbols = &encoded[9..9 + (seed_bytes * 8).div_ceil(5)];
    let mut last = None;
    for symbols in [symbols.to_ascii_lowercase(), symbols.to_ascii_uppercase()] {
        let constructed = Codex32::from_payload(k, identifier, at, &symbols).unwrap();
        assert_eq!(&*constructed.export(), &encoded.to_ascii_lowercase());
        let metadata = constructed.metadata();
        assert_eq!(metadata.threshold, k);
        assert_eq!(metadata.identifier, identifier);
        assert_eq!(metadata.index, at);
        assert_eq!(metadata.seed_bytes, seed_bytes);
        last = Some(constructed);
    }
    last.unwrap()
}

#[test]
fn payload_constructor_reproduces_independent_checksums_and_seed_bytes() {
    let fixtures = fixtures();
    for case in fixtures.seeds {
        let secret = assert_public_payload(&case.encoded, case.hex.len() / 2);
        assert_eq!(hex(secret.secret_seed().unwrap().expose_secret()), case.hex);
    }
    // The pinned BIP Python implementation produced every seed size 16..=64
    // and threshold 2..=9, with nonzero padding and both checksum lengths.
    assert_eq!(fixtures.reference_cases.len(), 49 * 8);
    for case in fixtures.reference_cases {
        let secret = assert_public_payload(&case.secret, case.hex.len() / 2);
        assert_eq!(hex(secret.secret_seed().unwrap().expose_secret()), case.hex);
        for encoded in case.shares {
            let share = assert_public_payload(&encoded, case.hex.len() / 2);
            assert_eq!(share.secret_seed().unwrap_err(), Error::ExpectedSecret);
        }
    }
}

#[test]
fn payload_lengths_accept_exactly_the_supported_byte_seed_sizes() {
    let sizes: BTreeMap<usize, usize> = (16usize..=64)
        .map(|bytes| ((bytes * 8).div_ceil(5), bytes))
        .collect();
    for length in 0..=110 {
        let result = payload(0, 's', &"q".repeat(length));
        if let Some(&bytes) = sizes.get(&length) {
            let secret = result.unwrap();
            assert_eq!(secret.metadata().seed_bytes, bytes);
            assert_eq!(
                secret.secret_seed().unwrap().expose_secret(),
                vec![0; bytes]
            );
        } else {
            assert_eq!(
                result.unwrap_err(),
                Error::Length,
                "payload length {length}"
            );
        }
    }
    for (symbols, encoded_length) in [(26, 48), (74, 96), (76, 100), (103, 127)] {
        assert_eq!(
            payload(2, 'a', &"q".repeat(symbols))
                .unwrap()
                .export()
                .len(),
            encoded_length
        );
    }
}

#[test]
fn every_padding_value_is_retained_without_changing_decoded_seed() {
    for seed_bytes in 16usize..=64 {
        let symbols = (seed_bytes * 8).div_ceil(5);
        let pad_bits = symbols * 5 - seed_bytes * 8;
        for &padding_symbol in ALPHABET.iter().take(1usize << pad_bits) {
            let mut input = "q".repeat(symbols - 1);
            input.push(char::from(padding_symbol));
            for k in [0, 2, 9] {
                let secret = payload(k, 's', &input).unwrap();
                assert_eq!(
                    secret.secret_seed().unwrap().expose_secret(),
                    vec![0; seed_bytes]
                );
                let encoded = secret.export();
                assert_eq!(&encoded[9..9 + symbols], input);
                let reparsed: Codex32 = encoded.parse().unwrap();
                assert_eq!(reparsed.export(), encoded);
            }
        }
    }
}

#[test]
fn payload_constructor_rejects_mixed_case_and_reports_bad_symbol_positions() {
    let mixed = format!("P{}", "q".repeat(25));
    assert_eq!(payload(2, 'a', &mixed).unwrap_err(), Error::MixedCase);
    let reversed_case = format!("p{}", "Q".repeat(25));
    assert_eq!(
        payload(2, 'a', &reversed_case).unwrap_err(),
        Error::MixedCase
    );

    for invalid in [
        '1', 'b', 'i', 'o', '!', ' ', '\n', '\0', 'é', '🦀', '\u{200d}',
    ] {
        // Retain a valid byte length to exercise symbol validation, including
        // Unicode rejection with a byte offset rather than a character count.
        let input = format!(
            "{}{}{}",
            "q".repeat(10),
            invalid,
            "q".repeat(16 - invalid.len_utf8())
        );
        assert_eq!(input.len(), 26);
        assert_eq!(
            payload(2, 'a', &input).unwrap_err(),
            Error::Character { position: 10 },
            "invalid character {invalid:?}"
        );
    }
    // A complete code is not a payload: the separator 1 is invalid here.
    assert_eq!(
        payload(2, 'a', NAME_A).unwrap_err(),
        Error::Character { position: 2 }
    );
}

#[test]
fn payload_constructor_enforces_threshold_and_secret_index_rules() {
    let symbols = "q".repeat(26);
    for k in [1, 10, 31, 255] {
        assert_eq!(payload(k, 's', &symbols).unwrap_err(), Error::Threshold);
    }
    for &symbol in ALPHABET {
        let at = char::from(symbol);
        let result = payload(0, at, &symbols);
        if at == 's' {
            assert!(result.unwrap().metadata().index.is_secret());
        } else {
            assert_eq!(result.unwrap_err(), Error::SecretIndex);
        }
        for k in 2..=9 {
            let share = payload(k, at, &symbols).unwrap();
            assert_eq!(share.metadata().threshold, k);
            assert_eq!(share.metadata().index, index(at));
        }
    }
    for invalid in ['1', 'b', 'i', 'o', ' ', 'é', '🦀'] {
        assert_eq!(ShareIndex::from_char(invalid), Err(Error::Index));
    }
}

#[test]
fn public_symbol_arithmetic_matches_worked_recovery_steps_and_field_identities() {
    // First payload column of the published NAME example: A=3, C=A, D=L,
    // secret=6. Factors were computed independently with BIP 93's Python.
    for (factor_a, a, product_a, factor_b, b, product_b, sum) in [
        ('v', '3', 'n', 'd', 'a', 'v', 'l'), // A,C -> D
        ('j', '3', 'p', 'n', 'a', 'm', '6'), // A,C -> S
        ('f', '3', '5', 'g', 'l', 'w', '6'), // A,D -> S
        ('k', 'a', 'f', 'h', 'l', 'n', '6'), // C,D -> S
    ] {
        assert_eq!(multiply_symbols(factor_a, a).unwrap(), product_a);
        assert_eq!(multiply_symbols(factor_b, b).unwrap(), product_b);
        assert_eq!(add_symbols(product_a, product_b).unwrap(), sum);
        assert_eq!(add_symbols(factor_a, factor_b).unwrap(), 'p');
    }
    for &symbol in ALPHABET {
        let lower = char::from(symbol);
        let upper = lower.to_ascii_uppercase();
        assert_eq!(add_symbols(lower, upper).unwrap(), 'q');
        assert_eq!(add_symbols(upper, 'Q').unwrap(), lower);
        assert_eq!(add_symbols('q', upper).unwrap(), lower);
        assert_eq!(multiply_symbols(upper, 'p').unwrap(), lower);
        assert_eq!(multiply_symbols('P', lower).unwrap(), lower);
        assert_eq!(multiply_symbols(lower, 'Q').unwrap(), 'q');
        assert_eq!(multiply_symbols('q', upper).unwrap(), 'q');
    }
}

#[test]
fn public_symbol_arithmetic_rejects_invalid_operands_with_their_positions() {
    for operation in [add_symbols, multiply_symbols] {
        for invalid in ['1', 'b', 'i', 'o', ' ', '\0', 'é', '🦀'] {
            assert_eq!(
                operation(invalid, 'q'),
                Err(Error::Character { position: 0 })
            );
            assert_eq!(
                operation('q', invalid),
                Err(Error::Character { position: 1 })
            );
        }
    }
}

fn interpolate_encoded(inputs: &[Codex32], target: ShareIndex) -> String {
    let weights = interpolation_weights(inputs, target).unwrap();
    let strings: Vec<_> = inputs.iter().map(Codex32::export).collect();
    let mut output = String::from("ms1");
    // The published operation applies to the header and checksum too. Verify
    // the full independently known code, not only the decoded seed bytes.
    for column in 3..strings[0].len() {
        let mut sum = 'q';
        for (encoded, &weight) in strings.iter().zip(&weights) {
            let product = multiply_symbols(char::from(encoded.as_bytes()[column]), weight).unwrap();
            sum = add_symbols(sum, product).unwrap();
        }
        output.push(sum);
    }
    output
}

#[test]
fn weights_follow_input_order_and_reproduce_the_published_name_codes() {
    for (a, b, target, factors) in [
        (NAME_A, NAME_C, NAME_D, ['v', 'd']),
        (NAME_A, NAME_C, NAME_S, ['j', 'n']),
        (NAME_A, NAME_D, NAME_S, ['f', 'g']),
        (NAME_C, NAME_D, NAME_S, ['k', 'h']),
    ] {
        let inputs = [a.parse::<Codex32>().unwrap(), b.parse().unwrap()];
        let at = index(char::from(target.as_bytes()[8]));
        assert_eq!(interpolation_weights(&inputs, at).unwrap(), factors);
        assert_eq!(
            interpolate_encoded(&inputs, at),
            target.to_ascii_lowercase()
        );
        let reversed = [inputs[1].clone(), inputs[0].clone()];
        assert_eq!(
            interpolation_weights(&reversed, at).unwrap(),
            [factors[1], factors[0]]
        );
        assert_eq!(
            interpolate_encoded(&reversed, at),
            target.to_ascii_lowercase()
        );
    }
}

#[test]
fn weights_reconstruct_reference_codes_for_every_threshold_and_seed_size() {
    for case in fixtures().reference_cases {
        let shares: Vec<Codex32> = case.shares.iter().map(|s| s.parse().unwrap()).collect();
        let k = usize::from(shares[0].metadata().threshold);
        assert_eq!(interpolate_encoded(&shares[..k], index('s')), case.secret);
        assert_eq!(
            interpolate_encoded(&shares[..k], shares[k].metadata().index),
            case.shares[k]
        );
    }
}

#[test]
fn weights_at_an_existing_index_form_a_unit_vector_including_the_secret() {
    for k in 2..=9 {
        let mut shares: Vec<_> = "acdefghjk"
            .chars()
            .take(usize::from(k))
            .map(|at| payload(k, at, &"q".repeat(26)).unwrap())
            .collect();
        for include_secret in [false, true] {
            if include_secret {
                shares[0] = payload(k, 's', &"p".repeat(26)).unwrap();
            }
            for position in 0..shares.len() {
                let mut expected = vec!['q'; shares.len()];
                expected[position] = 'p';
                let at = shares[position].metadata().index;
                assert_eq!(interpolation_weights(&shares, at).unwrap(), expected);
                assert_eq!(interpolate_encoded(&shares, at), *shares[position].export());
            }
            assert_eq!(
                interpolation_weights(&shares, index('z')).unwrap().len(),
                usize::from(k)
            );
        }
    }
}

#[test]
fn weight_validation_rejects_bad_sets_even_when_target_is_already_present() {
    let a = payload(2, 'a', &"q".repeat(26)).unwrap();
    let c = payload(2, 'c', &"p".repeat(26)).unwrap();
    let d = payload(2, 'd', &"z".repeat(26)).unwrap();
    let unshared = payload(0, 's', &"q".repeat(26)).unwrap();
    for target in [index('a'), ShareIndex::SECRET, index('z')] {
        assert_eq!(
            interpolation_weights(&[], target),
            Err(Error::ShareCount {
                required: 2,
                provided: 0
            })
        );
        assert_eq!(
            interpolation_weights(std::slice::from_ref(&a), target),
            Err(Error::ShareCount {
                required: 2,
                provided: 1
            })
        );
        assert_eq!(
            interpolation_weights(&[a.clone(), c.clone(), d.clone()], target),
            Err(Error::ShareCount {
                required: 2,
                provided: 3
            })
        );
        assert_eq!(
            interpolation_weights(std::slice::from_ref(&unshared), target),
            Err(Error::ExpectedShare)
        );
        assert_eq!(
            interpolation_weights(&[a.clone(), a.clone()], target),
            Err(Error::DuplicateIndex)
        );
        for incompatible in [
            payload(3, 'c', &"q".repeat(26)).unwrap(),
            Codex32::from_payload(2, "test".parse().unwrap(), index('c'), &"q".repeat(26)).unwrap(),
            payload(2, 'c', &"q".repeat(28)).unwrap(),
            unshared.clone(),
        ] {
            assert_eq!(
                interpolation_weights(&[a.clone(), incompatible], target),
                Err(Error::MismatchedShares)
            );
        }
    }
    // Coefficients describe compatible indices; payloads need not be the NAME
    // example's payloads, and these factors do not authenticate a share set.
    assert_eq!(
        interpolation_weights(&[a, c], index('s')).unwrap(),
        ['j', 'n']
    );
}
