use codex32_core::{Codex32, Seed};
use codex32_wallet::{
    CodexWallet, Error,
    bitcoin::{Network, bip32::Xpriv},
};
use serde::Deserialize;

#[derive(Deserialize)]
struct Fixture {
    seeds: Vec<SeedCase>,
    reference_cases: Vec<RecoveryCase>,
}
#[derive(Deserialize)]
struct SeedCase {
    encoded: String,
    xprv: String,
}
#[derive(Deserialize)]
struct RecoveryCase {
    secret: String,
    shares: Vec<String>,
}
fn fixture() -> Fixture {
    serde_json::from_str(include_str!("../../../tests/fixtures/bip93.json")).unwrap()
}

#[test]
fn official_master_keys_match() {
    for case in fixture().seeds {
        let secret: Codex32 = case.encoded.parse().unwrap();
        let seed = secret.secret_seed().unwrap();
        assert_eq!(
            Xpriv::new_master(Network::Bitcoin, seed.expose_secret())
                .unwrap()
                .to_string(),
            case.xprv
        );
    }
}
#[test]
fn fixed_bip86_wallet_identity_vector_is_stable() {
    let seed = Seed::from_bytes(&[5; 32]).unwrap(); // PUBLIC TEST DATA ONLY.
    let identity = CodexWallet::from_seed(&seed, Network::Regtest)
        .unwrap()
        .wallet_identity();
    assert_eq!(
        identity.digest_hex(),
        "adb35db5873ab9d3ba0c4b4b0a8e78b276b4a85fb48e983e6ba4a624771eb0bd"
    );
}

#[test]
fn shares_restore_identical_receive_and_change_addresses() {
    for case in fixture().reference_cases.into_iter().step_by(8) {
        let secret: Codex32 = case.secret.parse().unwrap();
        let expected =
            CodexWallet::from_seed(&secret.secret_seed().unwrap(), Network::Signet).unwrap();
        let shares: Vec<Codex32> = case.shares[1..]
            .iter()
            .map(|s| s.parse().unwrap())
            .collect();
        let restored = CodexWallet::restore(&shares, Network::Signet).unwrap();
        assert_eq!(restored.wallet_identity(), expected.wallet_identity());
        for change in [false, true] {
            for index in [0, 1, 7, 25] {
                assert_eq!(
                    restored.address(change, index).unwrap(),
                    expected.address(change, index).unwrap()
                );
            }
        }
    }
}

#[test]
fn public_state_reload_preserves_address_index_and_rejects_another_seed() {
    let seed = Seed::from_bytes(&[5; 32]).unwrap(); // PUBLIC TEST DATA ONLY.
    let mut wallet = CodexWallet::from_seed(&seed, Network::Regtest).unwrap();
    let first = wallet.next_receive_address();
    assert!(first.starts_with("bcrt1p"));
    let next = wallet.address(false, 1).unwrap();
    let state = wallet.export_public_state().unwrap();
    let identity = wallet.wallet_identity();
    assert_eq!(identity.network(), Network::Regtest);
    assert!(identity.external_descriptor().starts_with("tr("));
    assert!(identity.internal_descriptor().starts_with("tr("));
    assert!(!identity.external_descriptor().contains("prv"));
    assert!(!identity.internal_descriptor().contains("prv"));
    assert_ne!(
        identity.digest(),
        CodexWallet::from_seed(&seed, Network::Signet)
            .unwrap()
            .wallet_identity()
            .digest()
    );
    assert!(!state.contains("tprv") && !state.contains("xprv"));
    assert!(
        !state.contains(
            &Xpriv::new_master(Network::Regtest, seed.expose_secret())
                .unwrap()
                .to_string()
        )
    );
    let mut loaded = CodexWallet::load(&seed, Network::Regtest, &state).unwrap();
    assert_eq!(loaded.next_receive_address(), next);
    assert_eq!(loaded.wallet_identity(), identity);
    assert_ne!(first, next);
    assert!(
        CodexWallet::load(
            &Seed::from_bytes(&[6; 32]).unwrap(),
            Network::Regtest,
            &state
        )
        .is_err()
    );
    assert!(CodexWallet::load(&seed, Network::Signet, &state).is_err());
    assert!(CodexWallet::load(&seed, Network::Regtest, "{}").is_err());
    let changed = state.replacen("\"version\":2", "\"version\":99", 1);
    assert!(matches!(
        CodexWallet::load(&seed, Network::Regtest, &changed),
        Err(Error::StateVersion)
    ));
    let bip84_era = state.replacen("\"version\":2", "\"version\":1", 1);
    assert!(matches!(
        CodexWallet::load(&seed, Network::Regtest, &bip84_era),
        Err(Error::StateVersion)
    ));
    assert!(matches!(
        wallet.address(false, 1 << 31),
        Err(Error::AddressIndex)
    ));
    assert!(matches!(
        CodexWallet::from_seed(&seed, Network::Bitcoin),
        Err(Error::MainnetDisabled)
    ));
}

#[test]
fn bad_payment_inputs_fail_before_signing() {
    let seed = Seed::from_bytes(&[8; 32]).unwrap();
    let mut wallet = CodexWallet::from_seed(&seed, Network::Regtest).unwrap();
    let address = wallet.address(false, 0).unwrap();
    assert!(matches!(
        wallet.prepare_payment(&address, 0, 2),
        Err(Error::Payment)
    ));
    assert!(matches!(
        wallet.prepare_payment(&address, 1000, 0),
        Err(Error::Payment)
    ));
    assert!(matches!(
        wallet.prepare_payment("invalid", 1000, 2),
        Err(Error::Address)
    ));
    let signet_address = CodexWallet::from_seed(&seed, Network::Signet)
        .unwrap()
        .address(false, 0)
        .unwrap();
    assert!(matches!(
        wallet.prepare_payment(&signet_address, 1000, 2),
        Err(Error::Address)
    ));
    assert!(matches!(
        wallet.prepare_payment(&address, 1000, 2),
        Err(Error::BuildTransaction)
    ));
}
