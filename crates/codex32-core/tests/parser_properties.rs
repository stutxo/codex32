use codex32_core::Codex32;
use rand_chacha::ChaCha20Rng;
use rand_core::{RngCore, SeedableRng};
use serde::Deserialize;

#[derive(Deserialize)]
struct Fixtures {
    valid: Vec<String>,
}

fn assert_valid_results_round_trip(input: &str) -> bool {
    let Ok(parsed) = input.parse::<Codex32>() else {
        return false;
    };
    let canonical = parsed.export();
    let reparsed: Codex32 = canonical.parse().unwrap();
    assert_eq!(reparsed.metadata(), parsed.metadata());
    assert_eq!(reparsed.export(), canonical);
    match (parsed.secret_seed(), reparsed.secret_seed()) {
        (Ok(original), Ok(round_trip)) => {
            assert_eq!(original.expose_secret(), round_trip.expose_secret());
        }
        (Err(original), Err(round_trip)) => assert_eq!(original, round_trip),
        _ => panic!("secret/share classification changed after export"),
    }
    true
}

#[test]
fn deterministic_text_mutations_never_panic_and_valid_results_round_trip() {
    // Bounded property coverage, not a coverage-guided fuzzing campaign.
    let fixtures: Fixtures =
        serde_json::from_str(include_str!("../../../tests/fixtures/bip93.json")).unwrap();
    let mut rng = ChaCha20Rng::from_seed([93; 32]); // PUBLIC TEST DATA ONLY.
    let replacements: Vec<char> = "qpzry9x8gf2tvdw0s3jn54khce6mua7l1!\0\n é🦀\u{200d}\u{feff}"
        .chars()
        .collect();
    let mut accepted = 0;
    let mut rejected = 0;
    for valid in fixtures.valid {
        assert!(assert_valid_results_round_trip(&valid));
        for operation in (0..8).cycle().take(128) {
            let mut chars: Vec<char> = valid.chars().collect();
            let position = rng.next_u32() as usize % chars.len();
            let replacement = replacements[rng.next_u32() as usize % replacements.len()];
            match operation {
                0 => {
                    for character in &mut chars {
                        character.make_ascii_uppercase();
                    }
                }
                1 => chars.insert(position, replacement),
                2 => {
                    chars.remove(position);
                }
                3 => chars[position] = replacement,
                4 => {
                    for _ in 0..3 {
                        let position = rng.next_u32() as usize % chars.len();
                        chars[position] =
                            replacements[rng.next_u32() as usize % replacements.len()];
                    }
                }
                5 => chars.resize(rng.next_u32() as usize % 151, replacement),
                6 => {
                    chars.insert(0, '\u{feff}');
                    chars.push('\n');
                }
                7 => chars[position] = chars[position].to_ascii_uppercase(),
                _ => unreachable!(),
            }
            if assert_valid_results_round_trip(&chars.into_iter().collect::<String>()) {
                accepted += 1;
            } else {
                rejected += 1;
            }
        }
    }
    for _ in 0..1000 {
        let length = rng.next_u32() as usize % 151;
        let input: String = (0..length)
            .map(|_| replacements[rng.next_u32() as usize % replacements.len()])
            .collect();
        assert_valid_results_round_trip(&input);
    }
    assert!(accepted > 0 && rejected > 0);
}
