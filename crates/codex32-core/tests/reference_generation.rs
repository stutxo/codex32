use codex32_core::{Codex32, Seed, generate, split};
use rand_core::{TryCryptoRng, TryRngCore};
use serde::Deserialize;

#[derive(Deserialize)]
struct Fixtures {
    generation_cases: Vec<Case>,
}
#[derive(Deserialize)]
struct Case {
    hex: String,
    encoded_seed: String,
    threshold: u8,
    randomness_hex: String,
    shares: Vec<String>,
}
fn unhex(text: &str) -> Vec<u8> {
    (0..text.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&text[i..i + 2], 16).unwrap())
        .collect()
}

// Test-only replay of public fixture randomness. Never an application RNG.
struct Tape(std::vec::IntoIter<u8>);
impl TryRngCore for Tape {
    type Error = &'static str;
    fn try_next_u32(&mut self) -> Result<u32, Self::Error> {
        let mut b = [0; 4];
        self.try_fill_bytes(&mut b)?;
        Ok(u32::from_le_bytes(b))
    }
    fn try_next_u64(&mut self) -> Result<u64, Self::Error> {
        let mut b = [0; 8];
        self.try_fill_bytes(&mut b)?;
        Ok(u64::from_le_bytes(b))
    }
    fn try_fill_bytes(&mut self, output: &mut [u8]) -> Result<(), Self::Error> {
        for byte in output {
            *byte = self.0.next().ok_or("fixture exhausted")?;
        }
        Ok(())
    }
}
impl TryCryptoRng for Tape {}

#[test]
fn encoding_splitting_and_generation_match_python_byte_for_byte() {
    let fixture: Fixtures =
        serde_json::from_str(include_str!("../../../tests/fixtures/bip93.json")).unwrap();
    for case in fixture.generation_cases {
        let bytes = unhex(&case.hex);
        let seed = Seed::from_bytes(&bytes).unwrap();
        let id = "test".parse().unwrap();
        assert_eq!(&*Codex32::from_seed(&seed, id).export(), &case.encoded_seed);
        let randomness = unhex(&case.randomness_hex);
        let shares = split(
            &seed,
            id,
            case.threshold,
            case.shares.len(),
            &mut Tape(randomness.clone().into_iter()),
        )
        .unwrap();
        for (actual, expected) in shares.iter().zip(&case.shares) {
            assert_eq!(&*actual.export(), expected);
        }
        let mut tape = bytes.clone();
        tape.extend(randomness);
        let generated = generate(
            bytes.len(),
            id,
            case.threshold,
            case.shares.len(),
            &mut Tape(tape.into_iter()),
        )
        .unwrap();
        for (actual, expected) in generated.iter().zip(&case.shares) {
            assert_eq!(&*actual.export(), expected);
        }
    }
}
