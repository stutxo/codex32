//! Deterministic, public-data prototype of independently contributed BIP 93 shares.
//!
//! This is executable research evidence, not a production key ceremony. Every
//! secret printed by this program is fixed public test data and must never hold funds.

use bdk_wallet::bitcoin::{
    Network,
    bip32::Xpriv,
    hashes::{Hash, sha256},
};
use codex32_core::{Codex32, Identifier, ShareIndex, derive_share, generate_share, recover};
use rand_chacha::ChaCha20Rng;
use rand_core::SeedableRng;
use serde_json::{Value, json};

fn payload(encoded: &str) -> &str {
    let checksum_length = if encoded.len() - 3 <= 93 { 13 } else { 15 };
    &encoded[9..encoded.len() - checksum_length]
}

fn commitment(k: u8, identifier: &str, index: char, payload: &str) -> String {
    let material = format!("codex32-distributed-v1|{k}|{identifier}|{index}|{payload}");
    sha256::Hash::hash(material.as_bytes()).to_string()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn recovery(indices: [char; 2], shares: [&Codex32; 2]) -> Value {
    let recovered = recover(&[shares[0].clone(), shares[1].clone()]).unwrap();
    let seed = recovered.secret_seed().unwrap();
    let xprv = Xpriv::new_master(Network::Bitcoin, seed.expose_secret()).unwrap();
    json!({
        "indices": indices.map(|index| index.to_string()),
        "seed_hex": hex(seed.expose_secret()),
        "xprv": xprv.to_string()
    })
}

fn main() {
    const K: u8 = 2;
    const SEED_BYTES: usize = 32;
    let identifier_text = "dkg2";
    let identifier: Identifier = identifier_text.parse().unwrap();
    let a_index = ShareIndex::from_char('a').unwrap();
    let c_index = ShareIndex::from_char('c').unwrap();
    let d_index = ShareIndex::from_char('d').unwrap();

    // Independent deterministic RNG streams model separate hardware and service
    // contributors. Fixed seeds make this fixture reproducible and therefore public.
    let mut hardware_rng = ChaCha20Rng::from_seed([17; 32]);
    let mut service_rng = ChaCha20Rng::from_seed([29; 32]);
    let a = generate_share(SEED_BYTES, identifier, K, a_index, &mut hardware_rng).unwrap();
    let d = generate_share(SEED_BYTES, identifier, K, d_index, &mut service_rng).unwrap();
    let c = derive_share(&[a.clone(), d.clone()], c_index).unwrap();

    let a_encoded = a.export().as_str().to_owned();
    let c_encoded = c.export().as_str().to_owned();
    let d_encoded = d.export().as_str().to_owned();
    let a_payload = payload(&a_encoded).to_owned();
    let d_payload = payload(&d_encoded).to_owned();

    let output = json!({
        "schema": 1,
        "fixture_warning": "PUBLIC TEST DATA ONLY — DO NOT USE FOR FUNDS",
        "threshold": K,
        "identifier": identifier_text,
        "seed_bytes": SEED_BYTES,
        "independent_indices": ["a", "d"],
        "shares": [
            {"index": "a", "origin": "independent", "codex32": a_encoded},
            {"index": "c", "origin": "derived", "codex32": c_encoded},
            {"index": "d", "origin": "independent", "codex32": d_encoded}
        ],
        "contributions": [
            {
                "component": "hardware_wallet",
                "index": "a",
                "payload": a_payload,
                "commitment": commitment(K, identifier_text, 'a', &a_payload)
            },
            {
                "component": "company_service",
                "index": "d",
                "payload": d_payload,
                "commitment": commitment(K, identifier_text, 'd', &d_payload)
            }
        ],
        "trace": [
            {
                "order": 1,
                "stage": "generate",
                "component": "hardware_wallet",
                "component_class": "dedicated_hardware",
                "owner": "user",
                "possesses": ["share:user_home"]
            },
            {
                "order": 2,
                "stage": "generate",
                "component": "company_service",
                "component_class": "company_server",
                "owner": "company",
                "possesses": ["share:company_recovery"]
            },
            {
                "order": 3,
                "stage": "commit",
                "component": "hardware_wallet",
                "component_class": "dedicated_hardware",
                "owner": "user",
                "possesses": ["share:user_home", "commitment:hardware"]
            },
            {
                "order": 4,
                "stage": "commit",
                "component": "company_service",
                "component_class": "company_server",
                "owner": "company",
                "possesses": ["share:company_recovery", "commitment:company"]
            },
            {
                "order": 5,
                "stage": "reveal",
                "component": "hardware_wallet",
                "component_class": "dedicated_hardware",
                "owner": "user",
                "possesses": ["share:user_home"]
            },
            {
                "order": 6,
                "stage": "reveal",
                "component": "hardware_wallet",
                "component_class": "dedicated_hardware",
                "owner": "user",
                "possesses": ["share:user_home", "share:company_recovery"]
            },
            {
                "order": 7,
                "stage": "derive",
                "component": "hardware_wallet",
                "component_class": "dedicated_hardware",
                "owner": "user",
                "possesses": ["share:user_home", "share:user_exit", "share:company_recovery"]
            },
            {
                "order": 8,
                "stage": "recover",
                "component": "hardware_wallet",
                "component_class": "dedicated_hardware",
                "owner": "user",
                "possesses": ["seed"]
            },
            {
                "order": 9,
                "stage": "transport",
                "component": "phone",
                "component_class": "general_purpose",
                "owner": "user",
                "possesses": ["ciphertext:company_recovery"]
            }
        ],
        "recoveries": [
            recovery(['a', 'c'], [&a, &c]),
            recovery(['a', 'd'], [&a, &d]),
            recovery(['c', 'd'], [&c, &d])
        ],
        "deployment_invariant": "The company receives only its own contribution; both user shares and the recovered seed remain inside or are displayed by dedicated hardware.",
        "commitment_note": "Production commitments also bind a fresh ceremony nonce, protocol version, device identity, transcript role, and expiry."
    });

    println!("{output}");
}
