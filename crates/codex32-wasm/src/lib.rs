//! WebAssembly bindings for the shared wallet core. Experimental.

use codex32_core::{Codex32, Zeroizing, recover};
use codex32_wallet::{CodexWallet, bitcoin::Network};
use wasm_bindgen::prelude::*;

fn js_error(error: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&error.to_string())
}

fn parse_backup(input: &[String]) -> Result<Vec<Codex32>, JsValue> {
    if input.len() > 9 {
        return Err(js_error("provide at most nine shares for recovery"));
    }
    input.iter().map(|s| s.parse().map_err(js_error)).collect()
}

/// Validated backup data stays inside Rust until explicitly exported.
#[wasm_bindgen]
pub struct Backup {
    inner: Codex32,
}

#[wasm_bindgen]
impl Backup {
    #[wasm_bindgen(constructor)]
    pub fn new(encoded: &str) -> Result<Backup, JsValue> {
        Ok(Self {
            inner: encoded.parse().map_err(js_error)?,
        })
    }
    #[wasm_bindgen(getter)]
    pub fn threshold(&self) -> u8 {
        self.inner.metadata().threshold
    }
    #[wasm_bindgen(getter)]
    pub fn identifier(&self) -> String {
        self.inner.metadata().identifier.to_string()
    }
    #[wasm_bindgen(getter)]
    pub fn index(&self) -> String {
        self.inner.metadata().index.to_char().to_string()
    }
    #[wasm_bindgen(getter, js_name = seedBytes)]
    pub fn seed_bytes(&self) -> usize {
        self.inner.metadata().seed_bytes
    }
    /// Explicit sensitive export. JavaScript copies cannot be reliably zeroized.
    #[wasm_bindgen(js_name = exportText)]
    pub fn export_text(&self) -> String {
        self.inner.export().to_string()
    }
}

#[wasm_bindgen(js_name = recoverBackup)]
pub fn recover_backup(shares: Vec<String>) -> Result<Backup, JsValue> {
    let shares = Zeroizing::new(shares);
    Ok(Backup {
        inner: recover(&parse_backup(&shares)?).map_err(js_error)?,
    })
}

#[wasm_bindgen]
pub struct RecoveryWallet {
    inner: CodexWallet,
}

#[wasm_bindgen]
impl RecoveryWallet {
    #[wasm_bindgen(constructor)]
    pub fn new(backup: Vec<String>, network: &str) -> Result<RecoveryWallet, JsValue> {
        let backup = Zeroizing::new(backup);
        let network = match network {
            "regtest" => Network::Regtest,
            "signet" => Network::Signet,
            _ => return Err(js_error("choose regtest or signet for this prototype")),
        };
        Ok(Self {
            inner: CodexWallet::restore(&parse_backup(&backup)?, network).map_err(js_error)?,
        })
    }
    pub fn address(&self, change: bool, index: u32) -> Result<String, JsValue> {
        self.inner.address(change, index).map_err(js_error)
    }
    #[wasm_bindgen(js_name = nextReceiveAddress)]
    pub fn next_receive_address(&mut self) -> String {
        self.inner.next_receive_address()
    }
    #[wasm_bindgen(js_name = exportPublicState)]
    pub fn export_public_state(&self) -> Result<String, JsValue> {
        self.inner.export_public_state().map_err(js_error)
    }
}

#[cfg(all(test, target_arch = "wasm32"))]
mod tests {
    use super::*;
    use serde::Deserialize;
    use wasm_bindgen_test::wasm_bindgen_test;

    #[derive(Deserialize)]
    struct Fixtures {
        valid: Vec<String>,
        invalid: Vec<String>,
        reference_cases: Vec<RecoveryCase>,
    }
    #[derive(Deserialize)]
    struct RecoveryCase {
        secret: String,
        shares: Vec<String>,
    }
    fn fixture() -> Fixtures {
        serde_json::from_str(include_str!("../../../tests/fixtures/bip93.json")).unwrap()
    }

    #[wasm_bindgen_test]
    fn official_vectors_have_the_same_results_in_wasm() {
        for input in fixture().valid {
            assert_eq!(
                Backup::new(&input).unwrap().export_text(),
                input.to_lowercase()
            );
        }
        for input in fixture().invalid {
            assert!(Backup::new(&input).is_err());
        }
    }

    #[wasm_bindgen_test]
    fn every_reference_recovery_matches_in_wasm() {
        for case in fixture().reference_cases {
            let restored = recover_backup(case.shares[1..].to_vec()).unwrap();
            assert_eq!(restored.export_text(), case.secret);
        }
    }

    #[wasm_bindgen_test]
    fn wallet_recovery_matches_receive_and_change_addresses() {
        let case = fixture().reference_cases.remove(0);
        let original = RecoveryWallet::new(vec![case.secret], "signet").unwrap();
        let restored = RecoveryWallet::new(case.shares[1..].to_vec(), "signet").unwrap();
        for change in [false, true] {
            for index in [0, 1, 25] {
                assert_eq!(
                    restored.address(change, index).unwrap(),
                    original.address(change, index).unwrap()
                );
            }
        }
    }
}
