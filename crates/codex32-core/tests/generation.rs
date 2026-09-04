use codex32_core::{Codex32, Error, Seed, ShareIndex, generate, recover, split};
use rand_chacha::ChaCha20Rng;
use rand_core::{SeedableRng, TryCryptoRng, TryRngCore};

#[test]
fn generated_backups_round_trip_all_supported_parameters() {
    let mut rng = ChaCha20Rng::from_seed([42; 32]); // PUBLIC TEST DATA ONLY.
    for length in 16..=64 {
        let seed = Seed::from_bytes(&vec![length as u8; length]).unwrap();
        for k in 2..=9 {
            let shares = split(&seed, "test".parse().unwrap(), k, 31, &mut rng).unwrap();
            for offset in 0..=31 - k as usize {
                let parsed: Vec<Codex32> = shares[offset..offset + k as usize]
                    .iter()
                    .map(|s| s.export().parse().unwrap())
                    .collect();
                let recovered = recover(&parsed).unwrap().secret_seed().unwrap();
                assert_eq!(recovered.expose_secret(), seed.expose_secret());
            }
        }
    }
}

#[test]
fn fresh_generation_works_and_uses_new_randomness() {
    let mut rng = ChaCha20Rng::from_seed([7; 32]);
    let a = generate(32, "test".parse().unwrap(), 2, 3, &mut rng).unwrap();
    let b = generate(32, "test".parse().unwrap(), 2, 3, &mut rng).unwrap();
    assert_ne!(a[0].export(), b[0].export());
    assert_eq!(
        recover(&a[..2])
            .unwrap()
            .secret_seed()
            .unwrap()
            .expose_secret()
            .len(),
        32
    );
}

#[derive(Debug)]
struct BrokenRng;
impl TryRngCore for BrokenRng {
    type Error = &'static str;
    fn try_next_u32(&mut self) -> Result<u32, Self::Error> {
        Err("unavailable")
    }
    fn try_next_u64(&mut self) -> Result<u64, Self::Error> {
        Err("unavailable")
    }
    fn try_fill_bytes(&mut self, _: &mut [u8]) -> Result<(), Self::Error> {
        Err("unavailable")
    }
}
impl TryCryptoRng for BrokenRng {}

#[test]
fn randomness_failure_and_invalid_parameters_fail_closed() {
    let seed = Seed::from_bytes(&[42; 32]).unwrap();
    let id = "test".parse().unwrap();
    assert_eq!(
        split(&seed, id, 2, 3, &mut BrokenRng).unwrap_err(),
        Error::Randomness
    );
    assert_eq!(
        generate(32, id, 2, 3, &mut BrokenRng).unwrap_err(),
        Error::Randomness
    );
    for k in [0, 1, 10, 255] {
        assert_eq!(
            split(&seed, id, k, 3, &mut BrokenRng).unwrap_err(),
            Error::Threshold
        );
    }
    for count in [0, 1, 32, usize::MAX] {
        assert_eq!(
            split(&seed, id, 2, count, &mut BrokenRng).unwrap_err(),
            Error::BackupSize
        );
    }
    for size in [0, 15, 65, usize::MAX] {
        assert_eq!(
            generate(size, id, 2, 3, &mut BrokenRng).unwrap_err(),
            Error::SeedLength
        );
    }
}

#[test]
fn recovery_rejects_duplicate_mismatched_and_wrong_number_of_shares() {
    let mut rng = ChaCha20Rng::from_seed([3; 32]);
    let shares = generate(16, "test".parse().unwrap(), 2, 3, &mut rng).unwrap();
    assert!(matches!(
        recover(&shares[..1]),
        Err(Error::ShareCount { .. })
    ));
    assert!(matches!(recover(&shares), Err(Error::ShareCount { .. })));
    assert!(recover(&[]).is_err());
    assert_eq!(
        recover(&[shares[0].clone(), shares[0].clone()]).unwrap_err(),
        Error::DuplicateIndex
    );
    for (length, id, k) in [(32, "test", 2), (16, "cash", 2), (16, "test", 3)] {
        let other = generate(length, id.parse().unwrap(), k, 3, &mut rng).unwrap();
        assert_eq!(
            recover(&[shares[0].clone(), other[1].clone()]).unwrap_err(),
            Error::MismatchedShares
        );
    }
    let secret = recover(&shares[..2]).unwrap();
    assert_eq!(
        recover(&[shares[0].clone(), secret]).unwrap_err(),
        Error::ExpectedShare
    );
    assert_eq!(shares[0].secret_seed().unwrap_err(), Error::ExpectedSecret);
    assert!(codex32_core::derive_share(&shares[..2], ShareIndex::SECRET).is_err());
    assert_eq!(
        codex32_core::derive_share(&shares[..2], shares[0].metadata().index).unwrap_err(),
        Error::DuplicateIndex
    );
}

#[test]
fn parsing_malformed_text_never_panics_and_secrets_do_not_appear_in_debug() {
    for input in [
        "",
        "🐉",
        "ms1",
        " ms10testsxxxxxxxxxxxxxxxxxxxxxxxxxx4nzvca9cmczlw",
        "ms10testsxxxxxxxxxxxxxxxxxxxxxxxxxx4nzvca9cmczlw\n",
    ] {
        assert!(input.parse::<Codex32>().is_err());
    }
    let public = "ms10testsxxxxxxxxxxxxxxxxxxxxxxxxxx4nzvca9cmczlw";
    for position in 0..public.len() {
        for bad in [0u8, 32, 127, 255, b'!', b'B', b'I', b'O'] {
            let mut bytes = public.as_bytes().to_vec();
            bytes[position] = bad;
            if let Ok(input) = std::str::from_utf8(&bytes) {
                assert!(input.parse::<Codex32>().is_err());
            }
        }
    }
    let secret: Codex32 = public.parse().unwrap();
    assert!(!format!("{secret:?}").contains("xxxx"));
    assert_eq!(
        format!("{:?}", secret.secret_seed().unwrap()),
        "Seed([REDACTED])"
    );
    let error = public
        .replace("4nzv", "4nzq")
        .parse::<Codex32>()
        .unwrap_err();
    assert!(!format!("{error:?} {error}").contains("xxxx"));
}
