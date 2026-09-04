//! Fixed-profile creation transcript for the recommended Codex32 ceremony.
//!
//! This module binds contributions and an endpoint-encrypted delivery to one
//! ceremony. It intentionally does not implement encryption: callers must use a
//! reviewed HPKE or AEAD channel and pass [`CreationCeremony::delivery_aad`] as
//! associated data. Plaintext shares are accepted only at the signer endpoint.

use bdk_wallet::bitcoin::hashes::{Hash as _, HashEngine as _, sha256};
use codex32_core::{Codex32, Identifier, ShareIndex, derive_share, recover};
use std::fmt;

const PROTOCOL_VERSION: u16 = 1;
const THRESHOLD: u8 = 2;
const SEED_BYTES: usize = 32;
const HARDWARE_INDEX: char = 'a';
const EXIT_INDEX: char = 'c';
const COMPANY_INDEX: char = 'd';

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ContributionRole {
    Hardware,
    Company,
}

impl ContributionRole {
    fn tag(self) -> u8 {
        match self {
            Self::Hardware => 1,
            Self::Company => 2,
        }
    }

    fn index(self) -> ShareIndex {
        ShareIndex::from_char(match self {
            Self::Hardware => HARDWARE_INDEX,
            Self::Company => COMPANY_INDEX,
        })
        .expect("fixed BIP 93 index")
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum CeremonyState {
    HardwareCommitted,
    CommitmentsLocked,
    CompanyRevealed,
    Finalized,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum CeremonyError {
    #[error("ceremony bindings and expiry must be nonzero")]
    Binding,
    #[error("ceremony has expired")]
    Expired,
    #[error("operation is not valid in the current ceremony state")]
    State,
    #[error("contribution does not match the fixed ceremony metadata")]
    ContributionMetadata,
    #[error("contribution does not match its locked commitment")]
    Commitment,
    #[error("encrypted delivery is bound to another ceremony transcript")]
    DeliveryBinding,
    #[error(transparent)]
    Backup(#[from] codex32_core::Error),
}

/// Public, fixed-width values that bind one creation ceremony.
#[derive(Copy, Clone, PartialEq, Eq)]
pub struct CeremonyContext {
    identifier: Identifier,
    identifier_bytes: [u8; 4],
    ceremony_nonce: [u8; 32],
    account_binding: [u8; 32],
    endpoint_binding: [u8; 32],
    expires_at: u64,
}

impl fmt::Debug for CeremonyContext {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CeremonyContext")
            .field("identifier", &self.identifier)
            .field("expires_at", &self.expires_at)
            .finish_non_exhaustive()
    }
}

impl CeremonyContext {
    pub fn new(
        identifier: Identifier,
        ceremony_nonce: [u8; 32],
        account_binding: [u8; 32],
        endpoint_binding: [u8; 32],
        expires_at: u64,
    ) -> Result<Self, CeremonyError> {
        if expires_at == 0
            || ceremony_nonce == [0; 32]
            || account_binding == [0; 32]
            || endpoint_binding == [0; 32]
        {
            return Err(CeremonyError::Binding);
        }
        let identifier_text = identifier.to_string();
        let identifier_bytes = identifier_text
            .as_bytes()
            .try_into()
            .expect("a validated BIP 93 identifier has four ASCII bytes");
        Ok(Self {
            identifier,
            identifier_bytes,
            ceremony_nonce,
            account_binding,
            endpoint_binding,
            expires_at,
        })
    }

    pub fn identifier(self) -> Identifier {
        self.identifier
    }

    pub fn expires_at(self) -> u64 {
        self.expires_at
    }

    fn ensure_live(self, now: u64) -> Result<(), CeremonyError> {
        if now > self.expires_at {
            Err(CeremonyError::Expired)
        } else {
            Ok(())
        }
    }

    fn input(self, engine: &mut sha256::HashEngine) {
        engine.input(&PROTOCOL_VERSION.to_be_bytes());
        engine.input(&[THRESHOLD, SEED_BYTES as u8]);
        engine.input(&self.identifier_bytes);
        engine.input(&[
            HARDWARE_INDEX as u8,
            EXIT_INDEX as u8,
            COMPANY_INDEX as u8,
        ]);
        engine.input(&self.ceremony_nonce);
        engine.input(&self.account_binding);
        engine.input(&self.endpoint_binding);
        engine.input(&self.expires_at.to_be_bytes());
    }

    fn matches(self, role: ContributionRole, share: &Codex32) -> bool {
        let metadata = share.metadata();
        metadata.threshold == THRESHOLD
            && metadata.identifier == self.identifier
            && metadata.index == role.index()
            && metadata.seed_bytes == SEED_BYTES
    }

    /// Compute the domain-separated binding a contributor sends before reveal.
    pub fn contribution_commitment(
        self,
        role: ContributionRole,
        share: &Codex32,
    ) -> Result<[u8; 32], CeremonyError> {
        if !self.matches(role, share) {
            return Err(CeremonyError::ContributionMetadata);
        }
        let encoded = share.export();
        let mut engine = sha256::Hash::engine();
        engine.input(b"codex32/contribution/v1\0");
        self.input(&mut engine);
        engine.input(&[role.tag()]);
        engine.input(&(encoded.len() as u16).to_be_bytes());
        engine.input(encoded.as_bytes());
        Ok(sha256::Hash::from_engine(engine).to_byte_array())
    }

    fn delivery_aad(self, hardware: [u8; 32], company: [u8; 32]) -> [u8; 32] {
        let mut engine = sha256::Hash::engine();
        engine.input(b"codex32/company-delivery-aad/v1\0");
        self.input(&mut engine);
        engine.input(&hardware);
        engine.input(&company);
        sha256::Hash::from_engine(engine).to_byte_array()
    }

    fn transcript_id(self, hardware: [u8; 32], company: [u8; 32]) -> [u8; 32] {
        let aad = self.delivery_aad(hardware, company);
        let mut engine = sha256::Hash::engine();
        engine.input(b"codex32/creation-transcript/v1\0");
        engine.input(&aad);
        sha256::Hash::from_engine(engine).to_byte_array()
    }
}

/// Stateful verifier used by the signer endpoint.
pub struct CreationCeremony {
    context: CeremonyContext,
    hardware_commitment: [u8; 32],
    company_commitment: Option<[u8; 32]>,
    state: CeremonyState,
}

impl fmt::Debug for CreationCeremony {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CreationCeremony")
            .field("context", &self.context)
            .field("state", &self.state)
            .finish_non_exhaustive()
    }
}

impl CreationCeremony {
    pub fn begin(
        context: CeremonyContext,
        hardware_share: &Codex32,
        now: u64,
    ) -> Result<Self, CeremonyError> {
        context.ensure_live(now)?;
        let hardware_commitment =
            context.contribution_commitment(ContributionRole::Hardware, hardware_share)?;
        Ok(Self {
            context,
            hardware_commitment,
            company_commitment: None,
            state: CeremonyState::HardwareCommitted,
        })
    }

    pub fn state(&self) -> CeremonyState {
        self.state
    }

    pub fn hardware_commitment(&self) -> [u8; 32] {
        self.hardware_commitment
    }

    /// Lock the company's commitment before accepting its endpoint ciphertext.
    /// The returned value must be supplied as HPKE/AEAD associated data.
    pub fn lock_company_commitment(
        &mut self,
        company_commitment: [u8; 32],
        now: u64,
    ) -> Result<[u8; 32], CeremonyError> {
        if self.state != CeremonyState::HardwareCommitted {
            return Err(CeremonyError::State);
        }
        self.context.ensure_live(now)?;
        if company_commitment == [0; 32] {
            return Err(CeremonyError::Commitment);
        }
        self.company_commitment = Some(company_commitment);
        self.state = CeremonyState::CommitmentsLocked;
        Ok(self.context.delivery_aad(
            self.hardware_commitment,
            company_commitment,
        ))
    }

    pub fn delivery_aad(&self, now: u64) -> Result<[u8; 32], CeremonyError> {
        if self.state != CeremonyState::CommitmentsLocked {
            return Err(CeremonyError::State);
        }
        self.context.ensure_live(now)?;
        Ok(self.context.delivery_aad(
            self.hardware_commitment,
            self.company_commitment.expect("state requires commitment"),
        ))
    }

    /// Verify the share after a reviewed channel decrypts it inside the signer.
    pub fn accept_company_share(
        &mut self,
        company_share: &Codex32,
        delivery_aad: [u8; 32],
        now: u64,
    ) -> Result<(), CeremonyError> {
        if self.state != CeremonyState::CommitmentsLocked {
            return Err(CeremonyError::State);
        }
        self.context.ensure_live(now)?;
        let company_commitment = self.company_commitment.expect("state requires commitment");
        if delivery_aad
            != self
                .context
                .delivery_aad(self.hardware_commitment, company_commitment)
        {
            return Err(CeremonyError::DeliveryBinding);
        }
        if self
            .context
            .contribution_commitment(ContributionRole::Company, company_share)?
            != company_commitment
        {
            return Err(CeremonyError::Commitment);
        }
        self.state = CeremonyState::CompanyRevealed;
        Ok(())
    }

    pub fn finalize(
        &mut self,
        hardware_share: &Codex32,
        company_share: &Codex32,
        now: u64,
    ) -> Result<FinalizedCreation, CeremonyError> {
        if self.state != CeremonyState::CompanyRevealed {
            return Err(CeremonyError::State);
        }
        self.context.ensure_live(now)?;
        if self
            .context
            .contribution_commitment(ContributionRole::Hardware, hardware_share)?
            != self.hardware_commitment
        {
            return Err(CeremonyError::Commitment);
        }
        let company_commitment = self.company_commitment.expect("state requires commitment");
        if self
            .context
            .contribution_commitment(ContributionRole::Company, company_share)?
            != company_commitment
        {
            return Err(CeremonyError::Commitment);
        }
        let inputs = [hardware_share.clone(), company_share.clone()];
        let user_exit = derive_share(
            &inputs,
            ShareIndex::from_char(EXIT_INDEX).expect("fixed BIP 93 index"),
        )?;
        let recovered_secret = recover(&inputs)?;
        let transcript_id = self
            .context
            .transcript_id(self.hardware_commitment, company_commitment);
        self.state = CeremonyState::Finalized;
        Ok(FinalizedCreation {
            user_exit,
            recovered_secret,
            transcript_id,
        })
    }
}

pub struct FinalizedCreation {
    user_exit: Codex32,
    recovered_secret: Codex32,
    transcript_id: [u8; 32],
}

impl fmt::Debug for FinalizedCreation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("FinalizedCreation")
            .field("user_exit", &"[REDACTED]")
            .field("recovered_secret", &"[REDACTED]")
            .field("transcript_id", &self.transcript_id)
            .finish()
    }
}

impl FinalizedCreation {
    pub fn user_exit(&self) -> &Codex32 {
        &self.user_exit
    }

    pub fn recovered_secret(&self) -> &Codex32 {
        &self.recovered_secret
    }

    pub fn transcript_id(&self) -> [u8; 32] {
        self.transcript_id
    }
}
