use codex32_core::{Codex32, Error};
use serde::Deserialize;
use std::{fs::File, io::BufRead};

#[derive(Deserialize)]
struct Case {
    encoded: String,
    expected: Option<Expected>,
}

#[derive(Deserialize)]
struct Expected {
    canonical: String,
    threshold: u8,
    identifier: String,
    index: char,
    seed_bytes: usize,
    seed_hex: Option<String>,
}

#[test]
#[ignore = "run python3 scripts/check-conformance.py to generate the independent corpus"]
fn parser_matches_generated_bip93_reference() {
    let path = std::env::var_os("CODEX32_REFERENCE_CASES")
        .expect("run python3 scripts/check-conformance.py to supply the corpus");
    let corpus = std::io::BufReader::new(File::open(path).unwrap());
    let mut count = 0;
    for line in corpus.lines() {
        let case: Case = serde_json::from_str(&line.unwrap()).unwrap();
        let parsed = case.encoded.parse::<Codex32>();
        if let Some(expected) = case.expected {
            let value = parsed
                .unwrap_or_else(|error| panic!("rejected public case {}: {error}", case.encoded));
            assert_eq!(&*value.export(), &expected.canonical);
            let metadata = value.metadata();
            assert_eq!(metadata.threshold, expected.threshold);
            assert_eq!(metadata.identifier.to_string(), expected.identifier);
            assert_eq!(metadata.index.to_char(), expected.index);
            assert_eq!(metadata.seed_bytes, expected.seed_bytes);
            if let Some(expected_hex) = expected.seed_hex {
                let seed = value.secret_seed().unwrap();
                let hex: String = seed
                    .expose_secret()
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect();
                assert_eq!(hex, expected_hex);
            } else {
                assert_eq!(value.secret_seed().unwrap_err(), Error::ExpectedSecret);
            }
        } else {
            assert!(
                parsed.is_err(),
                "accepted invalid public case {}",
                case.encoded
            );
        }
        count += 1;
    }
    assert_eq!(count, 27072, "missing or truncated reference corpus");
}
