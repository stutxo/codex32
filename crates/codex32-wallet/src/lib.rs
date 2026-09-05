//! A minimal BIP 93 wallet core built on BDK. Experimental.
//!
//! This milestone supports test networks only. It uses BIP 86, account zero,
//! with external and change keychains. Chain data and storage are caller-owned.
pub mod ceremony;

use bdk_wallet::bitcoin::{
    Address, Amount, Block, FeeRate, Network, Psbt, Transaction, Txid,
    bip32::Xpriv,
    hashes::{Hash as _, HashEngine as _, sha256},
};
use bdk_wallet::{
    ChangeSet, KeychainKind, SignOptions, Wallet, chain::Merge, descriptor::template::Bip86,
};
use codex32_core::{Codex32, Seed, recover};
use serde::{Deserialize, Serialize};
use std::str::FromStr;

const STATE_VERSION: u32 = 2;

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
    #[error("the recovered wallet does not match the expected identity")]
    IdentityMismatch,
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
/// Canonical public recovery identity. Descriptors disclose wallet activity
/// when paired with chain data, but contain no private key material.
#[derive(Clone, PartialEq, Eq)]
pub struct WalletIdentity {
    network: Network,
    external_descriptor: String,
    internal_descriptor: String,
    digest: [u8; 32],
}

impl std::fmt::Debug for WalletIdentity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WalletIdentity")
            .field("network", &self.network)
            .field("digest", &self.digest)
            .finish_non_exhaustive()
    }
}

impl WalletIdentity {
    pub fn network(&self) -> Network {
        self.network
    }

    pub fn external_descriptor(&self) -> &str {
        &self.external_descriptor
    }

    pub fn internal_descriptor(&self) -> &str {
        &self.internal_descriptor
    }

    pub fn digest(&self) -> [u8; 32] {
        self.digest
    }
    pub fn digest_hex(&self) -> String {
        let mut encoded = String::with_capacity(64);
        for byte in self.digest {
            use std::fmt::Write as _;
            write!(&mut encoded, "{byte:02x}").expect("writing to a String cannot fail");
        }
        encoded
    }
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
            Bip86(key, KeychainKind::External),
            Bip86(key, KeychainKind::Internal),
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
    /// Checksums detect corruption; they do not authenticate the recovered wallet.
    /// Use [`Self::restore_verified`] when a trusted original identity is available.
    pub fn restore(backup: &[Codex32], network: Network) -> Result<Self, Error> {
        let secret = if backup.len() == 1 && backup[0].metadata().index.is_secret() {
            backup[0].clone()
        } else {
            recover(backup)?
        };
        Self::from_seed(&secret.secret_seed()?, network)
    }

    /// Restore only if the resulting network and descriptors match a previously
    /// recorded [`WalletIdentity::digest`]. The caller must obtain this digest
    /// from trusted storage or an independently authenticated original wallet,
    /// not from the same untrusted source as the recovery shares.
    pub fn restore_verified(
        backup: &[Codex32],
        network: Network,
        expected_digest: [u8; 32],
    ) -> Result<Self, Error> {
        let restored = Self::restore(backup, network)?;
        if restored.wallet_identity().digest() != expected_digest {
            return Err(Error::IdentityMismatch);
        }
        Ok(restored)
    }

    /// Load public state and reattach signing keys, checking descriptors and network.
    pub fn load(seed: &Seed, network: Network, serialized: &str) -> Result<Self, Error> {
        let key = root(seed, network)?;
        let snapshot: Snapshot = serde_json::from_str(serialized).map_err(|_| Error::State)?;
        if snapshot.version != STATE_VERSION {
            return Err(Error::StateVersion);
        }
        if snapshot.network != network {
            return Err(Error::State);
        }
        let wallet = Wallet::load()
            .descriptor(
                KeychainKind::External,
                Some(Bip86(key, KeychainKind::External)),
            )
            .descriptor(
                KeychainKind::Internal,
                Some(Bip86(key, KeychainKind::Internal)),
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
            version: STATE_VERSION,
            network: self.network,
            changeset: self.state.clone(),
        })
        .map_err(|_| Error::State)
    }
    /// Bind network, script policy, origins, public keys, and both keychains to
    /// one strong public identity. BDK's canonical descriptor strings include
    /// their descriptor checksums.
    pub fn wallet_identity(&self) -> WalletIdentity {
        let external_descriptor = self
            .wallet
            .public_descriptor(KeychainKind::External)
            .to_string();
        let internal_descriptor = self
            .wallet
            .public_descriptor(KeychainKind::Internal)
            .to_string();
        let mut engine = sha256::Hash::engine();
        engine.input(b"codex32/wallet-identity/v1\0");
        engine.input(self.network.chain_hash().as_bytes());
        for descriptor in [&external_descriptor, &internal_descriptor] {
            engine.input(&(descriptor.len() as u32).to_be_bytes());
            engine.input(descriptor.as_bytes());
        }
        let digest = sha256::Hash::from_engine(engine).to_byte_array();
        WalletIdentity {
            network: self.network,
            external_descriptor,
            internal_descriptor,
            digest,
        }
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

    /// Record relevant pending transactions with their last-seen timestamps.
    /// Register and persist an outgoing transaction before broadcasting it so
    /// subsequent proposals do not select its inputs again. The caller supplies
    /// trusted chain data and timestamps used by BDK to resolve conflicts.
    pub fn apply_unconfirmed_txs(
        &mut self,
        transactions: impl IntoIterator<Item = (Transaction, u64)>,
    ) {
        self.wallet.apply_unconfirmed_txs(transactions);
        self.capture();
    }

    /// Record transactions evicted from the mempool, then persist public state.
    /// The caller must establish eviction through its chain backend; a broadcast
    /// timeout alone does not establish that a transaction cannot still confirm.
    /// Use accurate, monotonically increasing observation timestamps.
    pub fn apply_evicted_txs(&mut self, transactions: impl IntoIterator<Item = (Txid, u64)>) {
        self.wallet.apply_evicted_txs(transactions);
        self.capture();
    }

    /// Build a proposal without signing. The application must show destination,
    /// amount, and actual fee and obtain confirmation before calling sign_payment.
    /// Amounts cannot exceed Bitcoin's maximum supply. Requested fee rates must
    /// not exceed [`Psbt::DEFAULT_MAX_FEE_RATE`], also enforced when signing.
    pub fn prepare_payment(
        &mut self,
        destination: &str,
        amount_sat: u64,
        sat_per_vbyte: u64,
    ) -> Result<Psbt, Error> {
        if amount_sat == 0 || amount_sat > Amount::MAX_MONEY.to_sat() || sat_per_vbyte == 0 {
            return Err(Error::Payment);
        }
        let destination = Address::from_str(destination)
            .map_err(|_| Error::Address)?
            .require_network(self.network)
            .map_err(|_| Error::Address)?;
        let fee = FeeRate::from_sat_per_vb(sat_per_vbyte).ok_or(Error::Payment)?;
        if fee > Psbt::DEFAULT_MAX_FEE_RATE {
            return Err(Error::Payment);
        }
        let mut builder = self.wallet.build_tx();
        builder
            .add_recipient(destination.script_pubkey(), Amount::from_sat(amount_sat))
            .fee_rate(fee);
        let result = builder.finish().map_err(|_| Error::BuildTransaction);
        self.capture();
        result
    }

    /// Sign only after the caller has reviewed this exact proposal. No broadcast occurs.
    /// A failed call leaves the supplied PSBT unchanged, including its signatures.
    pub fn sign_payment(&self, proposal: &mut Psbt) -> Result<Transaction, Error> {
        if proposal.inputs.len() != proposal.unsigned_tx.input.len()
            || proposal.outputs.len() != proposal.unsigned_tx.output.len()
        {
            return Err(Error::Signing);
        }
        proposal.fee().map_err(|_| Error::Signing)?;
        let mut signed = proposal.clone();
        let finalized = self
            .wallet
            .sign(&mut signed, SignOptions::default())
            .map_err(|_| Error::Signing)?;
        if !finalized {
            return Err(Error::Signing);
        }
        let transaction = signed.clone().extract_tx().map_err(|_| Error::Signing)?;
        *proposal = signed;
        Ok(transaction)
    }
}
