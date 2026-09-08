//! Error correction, anchored to the pinned BIP 93 test strings.
//!
//! Every input here is public test data. Correction returns the unique closest
//! valid string; these tests assert that recovery behavior, never that a
//! corrected string is authentic.
use codex32_core::{Codex32, Error};
use serde::Deserialize;

const CHARSET: &[u8; 32] = b"qpzry9x8gf2tvdw0s3jn54khce6mua7l";

#[derive(Deserialize)]
struct Fixtures {
    valid: Vec<String>,
}
fn valid() -> Vec<String> {
    serde_json::from_str::<Fixtures>(include_str!("../../../tests/fixtures/bip93.json"))
        .unwrap()
        .valid
}

fn corrupt_char(input: &str, position: usize, character: char) -> String {
    let mut corrupted: Vec<char> = input.chars().collect();
    corrupted[position] = character;
    corrupted.into_iter().collect()
}

/// One substitution at every data position of every published valid string,
/// across both checksum formats, must correct back to the exact original.
#[test]
fn every_single_substitution_is_corrected_to_the_original() {
    let mut corrections = 0;
    for encoded in valid() {
        let original = encoded.to_lowercase();
        let chars: Vec<char> = original.chars().collect();
        for (position, &current) in chars.iter().enumerate().skip(3) {
            for &replacement in CHARSET {
                let replacement = char::from(replacement);
                if replacement == current {
                    continue;
                }
                let corrupted = corrupt_char(&original, position, replacement);
                assert!(corrupted.parse::<Codex32>().is_err());
                assert_eq!(
                    Codex32::correct(&corrupted).unwrap().as_str(),
                    original,
                    "single substitution at {position} in {corrupted}"
                );
                corrections += 1;
            }
        }
    }
    assert!(corrections > 20_000, "exercised {corrections} corrections");
}

/// Damage in an uppercase string is recovered and canonicalized to lowercase.
#[test]
fn correction_accepts_uppercase_and_returns_lowercase() {
    for encoded in valid().into_iter().take(8) {
        let original = encoded.to_lowercase();
        let upper = encoded.to_uppercase();
        let chars: Vec<char> = upper.chars().collect();
        for position in [3, 9, chars.len() - 1] {
            let replacement = if chars[position] == 'Q' { 'P' } else { 'Q' };
            let corrupted = corrupt_char(&upper, position, replacement);
            assert_eq!(
                Codex32::correct(&corrupted).unwrap().as_str(),
                original,
                "uppercase correction at {position} in {corrupted}"
            );
        }
    }
}

/// Already-valid strings are returned unchanged, never "corrected" further.
#[test]
fn valid_strings_are_returned_unchanged() {
    for encoded in valid() {
        for input in [encoded.to_lowercase(), encoded.to_uppercase()] {
            assert_eq!(
                Codex32::correct(&input).unwrap().as_str(),
                encoded.to_lowercase()
            );
        }
    }
}

/// BIP 93 guarantees correction of up to 4 substitution errors. Spread the
/// damage across the header, identifier, payload, and checksum, for both the
/// short and long checksum formats.
#[test]
fn up_to_four_substitutions_are_corrected() {
    let short = "ms12namea320zyxwvutsrqpnmlkjhgfedcaxrpp870hkkqrm";
    let mut chars: Vec<char> = short.chars().collect();
    chars[3] = '4';
    chars[5] = 'a';
    chars[20] = 'q';
    chars[45] = '0';
    let corrupted: String = chars.into_iter().collect();
    assert!(corrupted.parse::<Codex32>().is_err());
    assert_eq!(Codex32::correct(&corrupted).unwrap().as_str(), short);

    let long = "ms100c8vsm32zxfguhpchtlupzry9x8gf2tvdw0s3jn54khce6mua7lqpzygsfjd6an074rxvcemlh8wu3tk925acdefghjklmnpqrstuvwxy06fhpv80undvarhrak";
    let mut chars: Vec<char> = long.chars().collect();
    chars[3] = '9';
    chars[8] = 'p';
    chars[60] = 'q';
    chars[126] = 'q';
    let corrupted: String = chars.into_iter().collect();
    assert!(corrupted.parse::<Codex32>().is_err());
    assert_eq!(Codex32::correct(&corrupted).unwrap().as_str(), long);
}

/// Errors carry positions and residue values only, never the supplied text.
#[test]
fn correction_failures_do_not_leak_input_text() {
    let original = "ms12namea320zyxwvutsrqpnmlkjhgfedcaxrpp870hkkqrm";
    let mut chars: Vec<char> = original.chars().collect();
    for position in [4, 7, 11, 17, 25, 33] {
        chars[position] = 'q';
    }
    let corrupted: String = chars.into_iter().collect();
    if let Err(error) = Codex32::correct(&corrupted) {
        let text = format!("{error:?} {error}");
        assert!(
            !text.contains("name") && !text.contains("320z"),
            "error leaked share text: {text}"
        );
    }
}

/// Structurally invalid shapes are rejected before any correction attempt.
#[test]
fn correction_rejects_structurally_invalid_strings() {
    for input in [
        "",
        "ms1",
        "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdx",
        "ms12NAMEa320zyxwvutsrqpnmlkjhgfedcaxrpp870hkkqrm",
    ] {
        assert!(
            Codex32::correct(input).is_err(),
            "accepted structurally invalid {input}"
        );
    }
    assert_eq!(
        Codex32::correct("xx12namea320zyxwvutsrqpnmlkjhgfedcaxrpp870hkkqrm"),
        Err(Error::Prefix)
    );
    // Mixed case is not correctable damage.
    assert_eq!(
        Codex32::correct("ms12Namea320zyxwvutsrqpnmlkjhgfedcaxrpp870hkkqrm"),
        Err(Error::MixedCase)
    );
    // A character outside the bech32 alphabet is an erasure, not a substitution.
    let mut bad = "ms12namea320zyxwvutsrqpnmlkjhgfedcaxrpp870hkkqrm".to_owned();
    bad.replace_range(10..11, "b");
    assert!(matches!(
        Codex32::correct(&bad),
        Err(Error::Character { position: 10 })
    ));
}

/// The checksum failure error exposes the crate's correction context, so
/// callers can implement erasure handling on top.
#[test]
fn checksum_errors_expose_a_correction_context() {
    use codex32_core::{CorrectableError, ShortChecksum};
    let original = "ms12namea320zyxwvutsrqpnmlkjhgfedcaxrpp870hkkqrm";
    let corrupted = corrupt_char(original, 9, 'q');
    let error = corrupted.parse::<Codex32>().unwrap_err();
    let mut corrector = error
        .correction_context::<ShortChecksum>()
        .expect("checksum failures carry a correction context");
    assert_eq!(corrector.singleton_bound(), 8);
    // Eight known erasure locations remain correctable per the BIP; declare
    // the damaged character as an erasure and recover its value.
    corrector.add_erasures(&[original.len() - 1 - 9]);
    let errors: Vec<_> = corrector.bch_errors().unwrap().collect();
    assert_eq!(errors.len(), 1);
}
