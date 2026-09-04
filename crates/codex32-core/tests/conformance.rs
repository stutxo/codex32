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
