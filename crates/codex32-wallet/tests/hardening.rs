//! All seeds, transactions, and synthetic chain data here are public test data.
use codex32_core::{Codex32, Seed, split};
use codex32_wallet::{
    CodexWallet, Error,
    bitcoin::{
        Address, Amount, Block, Network, OutPoint, Psbt, ScriptBuf, Sequence, Transaction, TxIn,
        TxOut, Txid, Witness, absolute, block, constants::genesis_block, hashes::Hash,
        sighash::TapSighashType, transaction,
    },
};
use rand_core::{TryCryptoRng, TryRngCore};
use std::{convert::Infallible, str::FromStr};

// Deterministic test randomness, never an application random source.
struct TestBytes(u8);
impl TryRngCore for TestBytes {
    type Error = Infallible;

    fn try_next_u32(&mut self) -> Result<u32, Self::Error> {
        let mut bytes = [0; 4];
        self.try_fill_bytes(&mut bytes)?;
        Ok(u32::from_le_bytes(bytes))
    }

    fn try_next_u64(&mut self) -> Result<u64, Self::Error> {
        let mut bytes = [0; 8];
        self.try_fill_bytes(&mut bytes)?;
        Ok(u64::from_le_bytes(bytes))
    }

    fn try_fill_bytes(&mut self, destination: &mut [u8]) -> Result<(), Self::Error> {
        for byte in destination {
            *byte = self.0;
            self.0 = self.0.wrapping_add(13);
        }
        Ok(())
    }
}
impl TryCryptoRng for TestBytes {}

#[test]
fn verified_restore_rejects_valid_shares_for_another_wallet() {
    let seed = Seed::from_bytes(&[1; 32]).unwrap();
    let original = CodexWallet::from_seed(&seed, Network::Regtest).unwrap();
    let expected = original.wallet_identity().digest();
    let shares = split(&seed, "test".parse().unwrap(), 2, 3, &mut TestBytes(7)).unwrap();
    let other = split(
        &Seed::from_bytes(&[2; 32]).unwrap(),
        "test".parse().unwrap(),
        2,
        3,
        &mut TestBytes(91),
    )
    .unwrap();

    let restored = CodexWallet::restore_verified(&shares[..2], Network::Regtest, expected).unwrap();
    assert_eq!(restored.wallet_identity(), original.wallet_identity());
    let direct = Codex32::from_seed(&seed, "test".parse().unwrap());
    assert!(CodexWallet::restore_verified(&[direct], Network::Regtest, expected).is_ok());

    // These share strings independently pass their checksums and have compatible
    // metadata, but were created for different secrets under the same identifier.
    let mixed: Vec<Codex32> = [&shares[0], &other[1]]
        .into_iter()
        .map(|share| share.export().parse().unwrap())
        .collect();
    assert!(CodexWallet::restore(&mixed, Network::Regtest).is_ok());
    assert!(matches!(
        CodexWallet::restore_verified(&mixed, Network::Regtest, expected),
        Err(Error::IdentityMismatch)
    ));
    assert!(matches!(
        CodexWallet::restore_verified(&shares[..2], Network::Signet, expected),
        Err(Error::IdentityMismatch)
    ));
}

const FUNDING_SAT: u64 = 10_000_000;

#[test]
fn extreme_payment_values_fail_before_transaction_arithmetic() {
    let seed = Seed::from_bytes(&[44; 32]).unwrap();
    let mut wallet = CodexWallet::from_seed(&seed, Network::Regtest).unwrap();
    let destination = wallet.address(false, 0).unwrap();
    let maximum_fee = Psbt::DEFAULT_MAX_FEE_RATE.to_sat_per_vb_floor();
    for (amount, fee) in [
        (u64::MAX, 2),
        (Amount::MAX_MONEY.to_sat() + 1, 2),
        (1_000, u64::MAX / 250),
        (1_000, u64::MAX),
        (1_000, maximum_fee + 1),
    ] {
        assert!(matches!(
            wallet.prepare_payment(&destination, amount, fee),
            Err(Error::Payment)
        ));
    }
    // The boundary values remain valid payment parameters; this empty wallet
    // rejects them for lack of funds rather than the numeric input guards.
    for (amount, fee) in [(Amount::MAX_MONEY.to_sat(), 2), (1_000, maximum_fee)] {
        assert!(matches!(
            wallet.prepare_payment(&destination, amount, fee),
            Err(Error::BuildTransaction)
        ));
    }
}

fn funded_wallet() -> (Seed, CodexWallet, String) {
    let seed = Seed::from_bytes(&[42; 32]).unwrap();
    let mut wallet = CodexWallet::from_seed(&seed, Network::Regtest).unwrap();
    let receiving_address = Address::from_str(&wallet.next_receive_address())
        .unwrap()
        .require_network(Network::Regtest)
        .unwrap();
    let genesis = genesis_block(Network::Regtest);
    let transaction = Transaction {
        version: transaction::Version::TWO,
        lock_time: absolute::LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint::new(Txid::from_byte_array([77; 32]), 0),
            script_sig: ScriptBuf::new(),
            sequence: Sequence::MAX,
            witness: Witness::new(),
        }],
        output: vec![TxOut {
            value: Amount::from_sat(FUNDING_SAT),
            script_pubkey: receiving_address.script_pubkey(),
        }],
    };
    // BDK consumes caller-validated chain data. This synthetic block exercises
    // wallet accounting; scripts/regtest.py separately checks node consensus.
    let mut block = Block {
        header: block::Header {
            version: block::Version::ONE,
            prev_blockhash: genesis.block_hash(),
            merkle_root: genesis.header.merkle_root,
            time: genesis.header.time + 1,
            bits: genesis.header.bits,
            nonce: 0,
        },
        txdata: vec![transaction],
    };
    block.header.merkle_root = block.compute_merkle_root().unwrap();
    wallet.apply_block(&block, 1).unwrap();
    assert_eq!(wallet.confirmed_balance_sat(), FUNDING_SAT);

    let destination =
        CodexWallet::from_seed(&Seed::from_bytes(&[43; 32]).unwrap(), Network::Regtest)
            .unwrap()
            .address(false, 0)
            .unwrap();
    (seed, wallet, destination)
}

#[test]
fn pending_spends_and_evictions_survive_reload_and_update_coin_selection() {
    let (seed, mut wallet, destination) = funded_wallet();
    let mut proposal = wallet.prepare_payment(&destination, 6_000_000, 2).unwrap();
    let fee = proposal.fee().unwrap().to_sat();
    let transaction = wallet.sign_payment(&mut proposal).unwrap();
    let spent_outpoint = transaction.input[0].previous_output;
    let txid = transaction.compute_txid();
    wallet.apply_unconfirmed_txs([(transaction, 1_000)]);
    assert_eq!(wallet.confirmed_balance_sat(), 0);
    assert_eq!(wallet.total_balance_sat(), FUNDING_SAT - 6_000_000 - fee);

    let mut loaded = CodexWallet::load(
        &seed,
        Network::Regtest,
        &wallet.export_public_state().unwrap(),
    )
    .unwrap();
    assert_eq!(loaded.total_balance_sat(), wallet.total_balance_sat());
    assert!(matches!(
        loaded.prepare_payment(&destination, 6_000_000, 2),
        Err(Error::BuildTransaction)
    ));
    let chained = loaded.prepare_payment(&destination, 1_000_000, 2).unwrap();
    assert!(
        chained
            .unsigned_tx
            .input
            .iter()
            .all(|input| input.previous_output != spent_outpoint)
    );

    loaded.apply_evicted_txs([(txid, 1_001)]);
    let mut after_eviction = CodexWallet::load(
        &seed,
        Network::Regtest,
        &loaded.export_public_state().unwrap(),
    )
    .unwrap();
    assert_eq!(after_eviction.confirmed_balance_sat(), FUNDING_SAT);
    let retry = after_eviction
        .prepare_payment(&destination, 6_000_000, 2)
        .unwrap();
    assert_eq!(retry.unsigned_tx.input[0].previous_output, spent_outpoint);
}

#[test]
fn rejected_signing_never_leaves_signatures_in_the_supplied_psbt() {
    let (_, mut wallet, destination) = funded_wallet();
    let proposal = wallet.prepare_payment(&destination, 1_000_000, 2).unwrap();

    let mut excessive_fee = proposal.clone();
    for output in &mut excessive_fee.unsigned_tx.output {
        output.value = Amount::from_sat(1_000);
    }
    assert!(excessive_fee.fee().unwrap().to_sat() > 9_000_000);

    let mut negative_fee = proposal.clone();
    negative_fee.unsigned_tx.output[0].value = Amount::from_sat(FUNDING_SAT + 1);
    let mut missing_input = proposal.clone();
    missing_input.inputs.clear();
    let mut missing_output = proposal.clone();
    missing_output.outputs.clear();
    let mut out_of_bounds_utxo = proposal.clone();
    out_of_bounds_utxo.inputs[0].witness_utxo = None;
    out_of_bounds_utxo.inputs[0].non_witness_utxo = Some(proposal.unsigned_tx.clone());
    out_of_bounds_utxo.unsigned_tx.input[0].previous_output.vout = u32::MAX;
    let mut nonstandard_sighash = proposal.clone();
    nonstandard_sighash.inputs[0].sighash_type = Some(TapSighashType::None.into());

    for mut invalid in [
        excessive_fee,
        negative_fee,
        missing_input,
        missing_output,
        out_of_bounds_utxo,
        nonstandard_sighash,
    ] {
        let before = invalid.clone();
        assert!(matches!(
            wallet.sign_payment(&mut invalid),
            Err(Error::Signing)
        ));
        assert_eq!(invalid, before);
    }

    let mut valid = proposal;
    let transaction = wallet.sign_payment(&mut valid).unwrap();
    assert!(
        transaction
            .input
            .iter()
            .all(|input| !input.witness.is_empty())
    );
    assert_eq!(valid.extract_tx().unwrap(), transaction);
}
