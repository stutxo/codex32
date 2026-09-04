//! Public-fixture protocol driver for scripts/regtest.py. Never uses real funds.
use codex32_core::Codex32;
use codex32_wallet::{
    CodexWallet,
    bitcoin::{
        Block, Network,
        consensus::encode::{deserialize_hex, serialize_hex},
    },
};
use serde_json::{Value, json};
use std::{
    error::Error,
    io::{self, BufRead, Write},
    path::PathBuf,
};

fn emit(value: Value) {
    println!("{value}");
    io::stdout().flush().unwrap();
}

fn main() -> Result<(), Box<dyn Error>> {
    let state_path = PathBuf::from(
        std::env::args()
            .nth(1)
            .ok_or("provide a temporary public-state file path")?,
    );
    let encoded: Codex32 = "ms13cashsllhdmn9m42vcsamx24zrxgs3qqjzqud4m0d6nln".parse()?;
    let seed = encoded.secret_seed()?;
    let shares = [
        "ms13casha320zyxwvutsrqpnmlkjhgfedca2a8d0zehn8a0t",
        "ms13cashd0wsedstcdcts64cd7wvy4m90lm28w4ffupqs7rm",
        "ms13cashf8jh6sdrkpyrsp5ut94pj8ktehhw2hfvyrj48704",
    ]
    .iter()
    .map(|s| s.parse())
    .collect::<Result<Vec<Codex32>, _>>()?;
    let original = CodexWallet::from_seed(&seed, Network::Regtest)?;
    let mut wallet = CodexWallet::restore(&shares, Network::Regtest)?;
    for change in [false, true] {
        for index in [0, 1, 7, 25] {
            assert_eq!(
                wallet.address(change, index)?,
                original.address(change, index)?
            );
        }
    }
    let address = wallet.next_receive_address();
    std::fs::write(&state_path, wallet.export_public_state()?)?;
    emit(json!({"phase": "ready", "address": address}));

    let mut input = io::stdin().lock().lines();
    let command: Value = serde_json::from_str(&input.next().ok_or("missing funding blocks")??)?;
    for (i, raw) in command["blocks"]
        .as_array()
        .ok_or("missing blocks")?
        .iter()
        .enumerate()
    {
        let block: Block = deserialize_hex(raw.as_str().ok_or("invalid block")?)?;
        wallet.apply_block(&block, u32::try_from(i + 1)?)?;
    }
    assert_eq!(wallet.confirmed_balance_sat(), 100_000_000);
    let state = wallet.export_public_state()?;
    assert!(!state.contains("xprv") && !state.contains("tprv"));
    std::fs::write(&state_path, state)?;
    drop(wallet);
    let mut wallet = CodexWallet::load(
        &seed,
        Network::Regtest,
        &std::fs::read_to_string(&state_path)?,
    )?;
    assert_eq!(wallet.confirmed_balance_sat(), 100_000_000);
    assert_eq!(wallet.next_receive_address(), original.address(false, 1)?);
    let mut proposal = wallet.prepare_payment(
        command["destination"]
            .as_str()
            .ok_or("missing destination")?,
        25_000_000,
        2,
    )?;
    let fee = proposal.fee()?.to_sat();
    assert!(fee > 0 && fee < 10_000);
    let signed = wallet.sign_payment(&mut proposal)?;
    std::fs::write(&state_path, wallet.export_public_state()?)?;
    emit(
        json!({"phase": "signed", "transaction": serialize_hex(&signed), "txid": signed.compute_txid().to_string(), "fee_sat": fee}),
    );

    let command: Value = serde_json::from_str(&input.next().ok_or("missing confirmation block")??)?;
    let block: Block = deserialize_hex(command["block"].as_str().ok_or("missing block")?)?;
    wallet.apply_block(
        &block,
        command["height"]
            .as_u64()
            .ok_or("missing height")?
            .try_into()?,
    )?;
    assert_eq!(wallet.confirmed_balance_sat(), 75_000_000 - fee);
    std::fs::write(&state_path, wallet.export_public_state()?)?;
    let reloaded = CodexWallet::load(
        &seed,
        Network::Regtest,
        &std::fs::read_to_string(state_path)?,
    )?;
    assert_eq!(
        reloaded.confirmed_balance_sat(),
        wallet.confirmed_balance_sat()
    );
    emit(
        json!({"phase": "complete", "confirmed_balance_sat": reloaded.confirmed_balance_sat(), "fee_sat": fee}),
    );
    Ok(())
}
