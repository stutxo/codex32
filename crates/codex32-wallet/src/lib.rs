//! A minimal BIP 93 wallet core built on BDK. Experimental.
//!
//! This milestone supports test networks only. It uses BIP 84, account zero,
//! with external and change keychains. Chain data and storage are caller-owned.

use bdk_wallet::bitcoin::{
    Address, Amount, Block, FeeRate, Network, Psbt, Transaction, bip32::Xpriv,
};
use bdk_wallet::{
    ChangeSet, KeychainKind, SignOptions, Wallet, chain::Merge, descriptor::template::Bip84,
};
use codex32_core::{Codex32, Seed, recover};
use serde::{Deserialize, Serialize};
use std::str::FromStr;

pub use bdk_wallet::bitcoin;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Backup(#[from] codex32_core::Error),
    #[error("this experimental wallet supports test networks only")]
    MainnetDisabled,
    #[error("could not derive the wallet from this seed")]
    Derivation,
    #[error("invalid wallet state or state belongs to a different wallet")]
    State,
    #[error("unsupported wallet state version")]
    StateVersion,
    #[error("address does not belong to the wallet network")]
    Address,
    #[error("invalid amount or fee rate")]
    Payment,
    #[error("address index must be below 2^31")]
    AddressIndex,
    #[error("unable to build the transaction")]
    BuildTransaction,
    #[error("unable to finalize the transaction signature")]
    Signing,
    #[error("block does not connect to the known chain")]
    Chain,
}

/// Public wallet state contains descriptors and transaction history: privacy-sensitive,
/// but never the seed or signing keys. Persistence encryption is a platform concern.
#[derive(Serialize, Deserialize)]
struct Snapshot {
    version: u32,
    network: Network,
    changeset: ChangeSet,
}

pub struct CodexWallet {
    wallet: Wallet,
    state: ChangeSet,
    network: Network,
}

impl std::fmt::Debug for CodexWallet {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("CodexWallet([REDACTED])")
    }
}

fn root(seed: &Seed, network: Network) -> Result<Xpriv, Error> {
    if network == Network::Bitcoin {
        return Err(Error::MainnetDisabled);
    }
    Xpriv::new_master(network, seed.expose_secret()).map_err(|_| Error::Derivation)
}

impl CodexWallet {
    pub fn from_seed(seed: &Seed, network: Network) -> Result<Self, Error> {
        let key = root(seed, network)?;
        let mut wallet = Wallet::create(
            Bip84(key, KeychainKind::External),
            Bip84(key, KeychainKind::Internal),
        )
        .network(network)
        .create_wallet_no_persist()
        .map_err(|_| Error::Derivation)?;
        let state = wallet.take_staged().ok_or(Error::State)?;
        Ok(Self {
            wallet,
            state,
            network,
        })
    }

    /// Accept a direct encoded seed or exactly threshold-many recovery shares.
    pub fn restore(backup: &[Codex32], network: Network) -> Result<Self, Error> {
        let secret = if backup.len() == 1 && backup[0].metadata().index.is_secret() {
            backup[0].clone()
        } else {
            recover(backup)?
        };
        Self::from_seed(&secret.secret_seed()?, network)
    }

    /// Load public state and reattach signing keys, checking descriptors and network.
    pub fn load(seed: &Seed, network: Network, serialized: &str) -> Result<Self, Error> {
        let key = root(seed, network)?;
        let snapshot: Snapshot = serde_json::from_str(serialized).map_err(|_| Error::State)?;
        if snapshot.version != 1 {
            return Err(Error::StateVersion);
        }
        if snapshot.network != network {
            return Err(Error::State);
        }
        let wallet = Wallet::load()
            .descriptor(
                KeychainKind::External,
                Some(Bip84(key, KeychainKind::External)),
            )
            .descriptor(
                KeychainKind::Internal,
                Some(Bip84(key, KeychainKind::Internal)),
            )
            .extract_keys()
            .check_network(network)
            .load_wallet_no_persist(snapshot.changeset.clone())
            .map_err(|_| Error::State)?
            .ok_or(Error::State)?;
        Ok(Self {
            wallet,
            state: snapshot.changeset,
            network,
        })
    }

    fn capture(&mut self) {
        if let Some(delta) = self.wallet.take_staged() {
            self.state.merge(delta);
        }
    }

    pub fn export_public_state(&self) -> Result<String, Error> {
        serde_json::to_string(&Snapshot {
            version: 1,
            network: self.network,
            changeset: self.state.clone(),
        })
        .map_err(|_| Error::State)
    }

    /// Preview an address without consuming its index.
    pub fn address(&self, change: bool, index: u32) -> Result<String, Error> {
        if index >= (1 << 31) {
            return Err(Error::AddressIndex);
        }
        Ok(self
            .wallet
            .peek_address(
                if change {
                    KeychainKind::Internal
                } else {
                    KeychainKind::External
                },
                index,
            )
            .address
            .to_string())
    }

    /// Reserve an address. Persist the resulting public state before displaying it.
    pub fn next_receive_address(&mut self) -> String {
        let address = self
            .wallet
            .reveal_next_address(KeychainKind::External)
            .address
            .to_string();
        self.capture();
        address
    }

    pub fn confirmed_balance_sat(&self) -> u64 {
        self.wallet.balance().confirmed.to_sat()
    }
    pub fn total_balance_sat(&self) -> u64 {
        self.wallet.balance().total().to_sat()
    }

    pub fn apply_block(&mut self, block: &Block, height: u32) -> Result<(), Error> {
        self.wallet
            .apply_block(block, height)
            .map_err(|_| Error::Chain)?;
        self.capture();
        Ok(())
    }

    /// Build a proposal without signing. The application must show destination,
    /// amount, and actual fee and obtain confirmation before calling sign_payment.
    pub fn prepare_payment(
        &mut self,
        destination: &str,
        amount_sat: u64,
        sat_per_vbyte: u64,
    ) -> Result<Psbt, Error> {
        if amount_sat == 0 || sat_per_vbyte == 0 {
            return Err(Error::Payment);
        }
        let destination = Address::from_str(destination)
            .map_err(|_| Error::Address)?
            .require_network(self.network)
            .map_err(|_| Error::Address)?;
        let fee = FeeRate::from_sat_per_vb(sat_per_vbyte).ok_or(Error::Payment)?;
        let mut builder = self.wallet.build_tx();
        builder
            .add_recipient(destination.script_pubkey(), Amount::from_sat(amount_sat))
            .fee_rate(fee);
        let result = builder.finish().map_err(|_| Error::BuildTransaction);
        self.capture();
        result
    }

    /// Sign only after the caller has reviewed this exact proposal. No broadcast occurs.
    pub fn sign_payment(&self, proposal: &mut Psbt) -> Result<Transaction, Error> {
        let finalized = self
            .wallet
            .sign(proposal, SignOptions::default())
            .map_err(|_| Error::Signing)?;
        if !finalized {
            return Err(Error::Signing);
        }
        proposal.clone().extract_tx().map_err(|_| Error::Signing)
    }
}
