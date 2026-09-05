use codex32_core::{Codex32, Seed, derive_share, recover};
use serde::Deserialize;

#[derive(Deserialize)]
struct Fixtures {
    valid: Vec<String>,
    invalid: Vec<String>,
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
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[test]
fn every_official_valid_string_round_trips_in_both_cases() {
    for encoded in fixtures().valid {
        for input in [encoded.to_lowercase(), encoded.to_uppercase()] {
            let parsed: Codex32 = input
                .parse()
                .unwrap_or_else(|e| panic!("public vector {input}: {e}"));
            assert_eq!(&*parsed.export(), &encoded.to_lowercase());
        }
    }
}

#[test]
fn every_official_invalid_vector_is_rejected() {
    for encoded in fixtures().invalid {
        assert!(
            encoded.parse::<Codex32>().is_err(),
            "accepted public invalid vector {encoded}"
        );
    }
}
fn assert_single_substitutions_rejected(encoded: &str) -> usize {
    const REPLACEMENTS: &[u8] = b"QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L1";
    assert!(encoded.parse::<Codex32>().is_ok());
    let mut rejected = 0;
    for position in 0..encoded.len() {
        for &replacement in REPLACEMENTS {
            if replacement == encoded.as_bytes()[position] {
                continue;
            }
            let mut corrupted = encoded.as_bytes().to_vec();
            corrupted[position] = replacement;
            let corrupted = String::from_utf8(corrupted).unwrap();
            assert!(
                corrupted.parse::<Codex32>().is_err(),
                "accepted substitution at {position}: {corrupted}"
            );
            rejected += 1;
        }
    }
    rejected
}

#[test]
fn every_single_character_substitution_is_rejected_for_both_checksums() {
    let standard = "MS12NAMEA320ZYXWVUTSRQPNMLKJHGFEDCAXRPP870HKKQRM";
    let long = "MS100C8VSM32ZXFGUHPCHTLUPZRY9X8GF2TVDW0S3JN54KHCE6MUA7LQPZYGSFJD6AN074RXVCEMLH8WU3TK925ACDEFGHJKLMNPQRSTUVWXY06FHPV80UNDVARHRAK";
    let rejected =
        assert_single_substitutions_rejected(standard) + assert_single_substitutions_rejected(long);
    assert_eq!(rejected, (standard.len() + long.len()) * 32);
}

#[test]
fn official_seeds_decode_with_arbitrary_padding() {
    for case in fixtures().seeds {
        let parsed: Codex32 = case.encoded.parse().unwrap();
        assert_eq!(hex(parsed.secret_seed().unwrap().expose_secret()), case.hex);
    }
}

#[test]
fn python_reference_covers_every_seed_size_and_threshold() {
    for case in fixtures().reference_cases {
        let shares: Vec<Codex32> = case.shares.iter().map(|s| s.parse().unwrap()).collect();
        let k = shares[0].metadata().threshold as usize;
        let restored = recover(&shares[1..]).unwrap();
        assert_eq!(&*restored.export(), &case.secret);
        assert_eq!(
            hex(restored.secret_seed().unwrap().expose_secret()),
            case.hex
        );
        let derived = derive_share(&shares[..k], shares[k].metadata().index).unwrap();
        assert_eq!(&*derived.export(), &case.shares[k]);
        let seed = Seed::from_bytes(restored.secret_seed().unwrap().expose_secret()).unwrap();
        assert_eq!(
            Codex32::from_seed(&seed, restored.metadata().identifier)
                .secret_seed()
                .unwrap()
                .expose_secret(),
            seed.expose_secret()
        );
    }
}

#[test]
fn recovery_and_derivation_are_independent_of_input_order() {
    for case in fixtures().reference_cases {
        if ![16, 47, 64].contains(&(case.hex.len() / 2)) {
            continue;
        }
        let shares: Vec<Codex32> = case.shares.iter().map(|s| s.parse().unwrap()).collect();
        let k = usize::from(shares[0].metadata().threshold);
        let mut inputs = shares[..k].to_vec();
        for _ in 0..k {
            inputs.rotate_left(1);
            for reversed in [false, true] {
                let mut permutation = inputs.clone();
                if reversed {
                    permutation.reverse();
                }
                assert_eq!(&*recover(&permutation).unwrap().export(), &case.secret);
                let derived = derive_share(&permutation, shares[k].metadata().index).unwrap();
                assert_eq!(&*derived.export(), &case.shares[k]);
            }
        }
    }
}

#[test]
fn a_secret_can_replace_any_input_when_deriving_a_share() {
    for case in fixtures().reference_cases {
        if ![16, 47, 64].contains(&(case.hex.len() / 2)) {
            continue;
        }
        let shares: Vec<Codex32> = case.shares.iter().map(|s| s.parse().unwrap()).collect();
        let k = usize::from(shares[0].metadata().threshold);
        let secret: Codex32 = case.secret.parse().unwrap();
        for position in 0..k {
            let mut inputs = shares[..k].to_vec();
            let removed_index = inputs[position].metadata().index;
            inputs[position] = secret.clone();
            let derived = derive_share(&inputs, removed_index).unwrap();
            assert_eq!(&*derived.export(), &case.shares[position]);
        }
    }
}

#[test]
fn official_cash_shares_recover_from_every_three_of_five() {
    let shares: Vec<Codex32> = fixtures()
        .valid
        .into_iter()
        .filter(|s| s.starts_with("ms13cash") && s.as_bytes()[8] != b's')
        .map(|s| s.parse().unwrap())
        .collect();
    assert_eq!(shares.len(), 5);
    for a in 0..3 {
        for b in a + 1..4 {
            for c in b + 1..5 {
                let seed = recover(&[shares[a].clone(), shares[b].clone(), shares[c].clone()])
                    .unwrap()
                    .secret_seed()
                    .unwrap();
                assert_eq!(
                    hex(seed.expose_secret()),
                    "ffeeddccbbaa99887766554433221100"
                );
            }
        }
    }
}
