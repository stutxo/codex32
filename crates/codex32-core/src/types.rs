use crate::checksum;
use bech32::Fe32;
use std::{fmt, str::FromStr};
use zeroize::Zeroizing;

/// Errors contain positions and metadata, never the supplied secret text.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum Error {
    #[error("a master seed must contain 16 to 64 bytes")]
    SeedLength,
    #[error("invalid Codex32 length")]
    Length,
    #[error("Codex32 must begin with ms1 or MS1")]
    Prefix,
    #[error("Codex32 cannot mix uppercase and lowercase")]
    MixedCase,
    #[error("invalid character at byte position {position}")]
    Character { position: usize },
    #[error("the identifier must contain four Bech32 characters")]
    Identifier,
    #[error("the threshold must be zero or between two and nine")]
    Threshold,
    #[error("a zero threshold requires the secret index S")]
    SecretIndex,
    #[error("invalid share index")]
    Index,
    #[error("the checksum does not match")]
    Checksum,
    #[error("expected an unshared secret with index S")]
    ExpectedSecret,
    #[error("expected recovery shares, not an unshared secret")]
    ExpectedShare,
    #[error("recovery needs exactly {required} shares; received {provided}")]
    ShareCount { required: usize, provided: usize },
    #[error("shares have different thresholds, identifiers, or lengths")]
    MismatchedShares,
    #[error("a share index is repeated or already in use")]
    DuplicateIndex,
    #[error("the number of shares must be between the threshold and 31")]
    BackupSize,
    #[error("the cryptographic random source failed")]
    Randomness,
}

/// An owned master seed. Access is explicit; formatting never reveals it.
pub struct Seed(Zeroizing<Vec<u8>>);

impl Seed {
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, Error> {
        check_seed_len(bytes.len())?;
        Ok(Self(Zeroizing::new(bytes.to_vec())))
    }
    pub fn expose_secret(&self) -> &[u8] {
        &self.0
    }
}

impl fmt::Debug for Seed {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Seed([REDACTED])")
    }
}

pub(crate) fn check_seed_len(length: usize) -> Result<(), Error> {
    if (16..=64).contains(&length) {
        Ok(())
    } else {
        Err(Error::SeedLength)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct Identifier(pub(crate) [u8; 4]);

impl FromStr for Identifier {
    type Err = Error;
    fn from_str(input: &str) -> Result<Self, Error> {
        if input.len() != 4 {
            return Err(Error::Identifier);
        }
        let mut id = [0; 4];
        for (slot, c) in id.iter_mut().zip(input.chars()) {
            *slot = Fe32::from_char(c).map_err(|_| Error::Identifier)?.to_u8();
        }
        Ok(Self(id))
    }
}

impl fmt::Display for Identifier {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for &symbol in &self.0 {
            write!(f, "{}", fe(symbol).to_char())?;
        }
        Ok(())
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct ShareIndex(pub(crate) u8);

impl ShareIndex {
    pub const SECRET: Self = Self(16);
    pub fn from_char(c: char) -> Result<Self, Error> {
        Ok(Self(Fe32::from_char(c).map_err(|_| Error::Index)?.to_u8()))
    }
    pub fn to_char(self) -> char {
        fe(self.0).to_char()
    }
    pub fn is_secret(self) -> bool {
        self == Self::SECRET
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct Metadata {
    pub threshold: u8,
    pub identifier: Identifier,
    pub index: ShareIndex,
    pub seed_bytes: usize,
}

/// Validated Codex32 data. Original padding bits are retained for interpolation.
/// Export is canonical lowercase; uppercase is a presentation choice.
#[derive(Clone)]
pub struct Codex32 {
    pub(crate) metadata: Metadata,
    pub(crate) payload: Zeroizing<Vec<u8>>,
}

impl fmt::Debug for Codex32 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Codex32")
            .field("metadata", &self.metadata)
            .field("payload", &"[REDACTED]")
            .finish()
    }
}

pub(crate) fn fe(value: u8) -> Fe32 {
    Fe32::try_from(value).expect("validated field element")
}

pub(crate) fn threshold(value: u8) -> Result<(), Error> {
    if value == 0 || (2..=9).contains(&value) {
        Ok(())
    } else {
        Err(Error::Threshold)
    }
}

impl FromStr for Codex32 {
    type Err = Error;
    fn from_str(input: &str) -> Result<Self, Error> {
        if !(48..=127).contains(&input.len()) {
            return Err(Error::Length);
        }
        if let Some((position, _)) = input
            .bytes()
            .enumerate()
            .find(|(_, b)| !(33..=126).contains(b))
        {
            return Err(Error::Character { position });
        }
        let has_upper = input.bytes().any(|b| b.is_ascii_uppercase());
        let has_lower = input.bytes().any(|b| b.is_ascii_lowercase());
        if has_upper && has_lower {
            return Err(Error::MixedCase);
        }
        if !input[..3].eq_ignore_ascii_case("ms1") {
            return Err(Error::Prefix);
        }
        let mut data = Zeroizing::new(Vec::with_capacity(input.len() - 3));
        for (offset, c) in input[3..].chars().enumerate() {
            data.push(
                Fe32::from_char(c)
                    .map_err(|_| Error::Character {
                        position: offset + 3,
                    })?
                    .to_u8(),
            );
        }
        let checksum_len = match data.len() {
            0..=93 => 13,
            96..=124 => 15,
            _ => return Err(Error::Length),
        };
        let payload_len = data.len() - 6 - checksum_len;
        if payload_len * 5 % 8 > 4 {
            return Err(Error::Length);
        }
        let seed_bytes = payload_len * 5 / 8;
        check_seed_len(seed_bytes).map_err(|_| Error::Length)?;
        let k = input.as_bytes()[3]
            .checked_sub(b'0')
            .ok_or(Error::Threshold)?;
        threshold(k)?;
        let index = ShareIndex(data[5]);
        if k == 0 && !index.is_secret() {
            return Err(Error::SecretIndex);
        }
        if !checksum::valid(&data) {
            return Err(Error::Checksum);
        }
        Ok(Self {
            metadata: Metadata {
                threshold: k,
                identifier: Identifier(data[1..5].try_into().expect("four symbols")),
                index,
                seed_bytes,
            },
            payload: Zeroizing::new(data[6..6 + payload_len].to_vec()),
        })
    }
}

impl Codex32 {
    pub fn metadata(&self) -> Metadata {
        self.metadata
    }

    pub fn from_seed(seed: &Seed, identifier: Identifier) -> Self {
        let bytes = seed.expose_secret();
        let mut payload = Zeroizing::new(Vec::with_capacity((bytes.len() * 8).div_ceil(5)));
        let (mut accumulator, mut bits) = (0u16, 0usize);
        for &byte in bytes {
            accumulator = (accumulator << 8) | u16::from(byte);
            bits += 8;
            while bits >= 5 {
                bits -= 5;
                payload.push(((accumulator >> bits) & 31) as u8);
            }
        }
        if bits > 0 {
            payload.push(((accumulator << (5 - bits)) & 31) as u8);
        }
        Self {
            metadata: Metadata {
                threshold: 0,
                identifier,
                index: ShareIndex::SECRET,
                seed_bytes: bytes.len(),
            },
            payload,
        }
    }

    /// Explicitly export the complete secret or recovery share. Treat as sensitive.
    pub fn export(&self) -> Zeroizing<String> {
        let mut data = Zeroizing::new(Vec::with_capacity(124));
        data.push(
            Fe32::from_char(char::from(b'0' + self.metadata.threshold))
                .expect("validated threshold")
                .to_u8(),
        );
        data.extend_from_slice(&self.metadata.identifier.0);
        data.push(self.metadata.index.0);
        data.extend_from_slice(&self.payload);
        checksum::append(&mut data);
        let mut output = Zeroizing::new(String::with_capacity(data.len() + 3));
        output.push_str("ms1");
        for &symbol in data.iter() {
            output.push(fe(symbol).to_char());
        }
        output
    }

    pub fn secret_seed(&self) -> Result<Seed, Error> {
        if !self.metadata.index.is_secret() {
            return Err(Error::ExpectedSecret);
        }
        let mut bytes = Zeroizing::new(Vec::with_capacity(self.metadata.seed_bytes));
        let (mut accumulator, mut bits) = (0u16, 0usize);
        for &symbol in self.payload.iter() {
            accumulator = (accumulator << 5) | u16::from(symbol);
            bits += 5;
            if bits >= 8 {
                bits -= 8;
                bytes.push((accumulator >> bits) as u8);
            }
        }
        // BIP 93 deliberately discards arbitrary final padding bits.
        Ok(Seed(bytes))
    }
}
