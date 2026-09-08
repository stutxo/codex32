//! Generate one fresh Codex32-encoded BIP32 seed and a 2-of-3 backup.
//!
//! Codex32 does not encode a Bitcoin network, script type, or derivation path.
//! Those choices are made by the wallet that imports this secret.

use codex32_core::{Identifier, generate, recover};
use rand_core::{OsRng, TryRngCore};
use std::{env, io::IsTerminal};

const SEED_BYTES: usize = 32;
const DEFAULT_THRESHOLD: u8 = 2;
const MAX_THRESHOLD: u8 = 9;
const DEFAULT_SHARE_COUNT: usize = 3;
const MAX_SHARE_COUNT: usize = 31;
const BECH32_ALPHABET: &[u8; 32] = b"qpzry9x8gf2tvdw0s3jn54khce6mua7l";

#[derive(Debug, PartialEq, Eq)]
struct Options {
    threshold: u8,
    share_count: usize,
    identifier: Option<Identifier>,
}

#[derive(Debug, PartialEq, Eq)]
enum Command {
    Generate(Options),
    Help,
}

fn parse_options(mut arguments: impl Iterator<Item = String>) -> Result<Command, String> {
    let mut options = Options {
        threshold: DEFAULT_THRESHOLD,
        share_count: DEFAULT_SHARE_COUNT,
        identifier: None,
    };
    let mut saw_shares = false;
    let mut saw_threshold = false;
    let mut saw_identifier = false;

    while let Some(option) = arguments.next() {
        match option.as_str() {
            "--help" | "-h" => {
                if saw_shares || saw_threshold || saw_identifier || arguments.next().is_some() {
                    return Err("--help does not accept other arguments".to_owned());
                }
                return Ok(Command::Help);
            }
            "--shares" => {
                if saw_shares {
                    return Err("--shares may only be specified once".to_owned());
                }
                saw_shares = true;
                let value = arguments
                    .next()
                    .ok_or_else(|| "--shares requires a number".to_owned())?;
                let count = value
                    .parse::<usize>()
                    .map_err(|_| format!("invalid share count: {value}"))?;
                if !(2..=MAX_SHARE_COUNT).contains(&count) {
                    return Err(format!(
                        "share count must be between 2 and {MAX_SHARE_COUNT}"
                    ));
                }
                options.share_count = count;
            }
            "--threshold" => {
                if saw_threshold {
                    return Err("--threshold may only be specified once".to_owned());
                }
                saw_threshold = true;
                let value = arguments
                    .next()
                    .ok_or_else(|| "--threshold requires a number".to_owned())?;
                let threshold = value
                    .parse::<u8>()
                    .map_err(|_| format!("invalid threshold: {value}"))?;
                if !(2..=MAX_THRESHOLD).contains(&threshold) {
                    return Err(format!("threshold must be between 2 and {MAX_THRESHOLD}"));
                }
                options.threshold = threshold;
            }
            "--identifier" => {
                if saw_identifier {
                    return Err("--identifier may only be specified once".to_owned());
                }
                saw_identifier = true;
                let value = arguments
                    .next()
                    .ok_or_else(|| "--identifier requires four Bech32 characters".to_owned())?;
                options.identifier = Some(value.parse().map_err(|_| {
                    format!("invalid identifier: {value} (use four Bech32 characters)")
                })?);
            }
            _ => return Err(format!("unknown option: {option}")),
        }
    }
    if usize::from(options.threshold) > options.share_count {
        return Err("threshold cannot exceed share count".to_owned());
    }
    Ok(Command::Generate(options))
}

fn random_identifier(rng: &mut OsRng) -> Result<Identifier, Box<dyn std::error::Error>> {
    let mut randomness = [0_u8; 4];
    rng.try_fill_bytes(&mut randomness)?;
    let label: String = randomness
        .iter()
        .map(|byte| BECH32_ALPHABET[usize::from(byte & 31)] as char)
        .collect();
    Ok(label.parse()?)
}

fn print_usage(program: &str) {
    println!("Usage: {program} [--threshold <2-9>] [--shares <2-31>] [--identifier <label>]");
    println!(
        "Generates a K-of-N Codex32 backup; defaults to {DEFAULT_THRESHOLD}-of-{DEFAULT_SHARE_COUNT}."
    );
    println!("The label defaults to four random Bech32 characters (example: sats).");
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut arguments = env::args();
    let program = arguments
        .next()
        .unwrap_or_else(|| "generate_secret".to_owned());
    let options = match parse_options(arguments) {
        Ok(Command::Generate(options)) => options,
        Ok(Command::Help) => {
            print_usage(&program);
            return Ok(());
        }
        Err(error) => {
            eprintln!("Error: {error}");
            print_usage(&program);
            std::process::exit(2);
        }
    };
    if !std::io::stdout().is_terminal() {
        return Err(std::io::Error::other(
            "refusing to print a wallet secret when standard output is not a terminal",
        )
        .into());
    }

    let mut rng = OsRng;
    let identifier = match options.identifier {
        Some(identifier) => identifier,
        None => random_identifier(&mut rng)?,
    };
    let shares = generate(
        SEED_BYTES,
        identifier,
        options.threshold,
        options.share_count,
        &mut rng,
    )?;
    let secret = recover(&shares[..usize::from(options.threshold)])?;
    let encoded = secret.export();

    println!("Codex32 secret recovered from the shares (share index S):");
    println!("{}", encoded.as_str());
    println!();
    println!("Identifier: {identifier}");
    println!();
    println!(
        "Codex32 {}-of-{} backup shares (any {} reconstruct the same seed):",
        options.threshold, options.share_count, options.threshold
    );
    for share in &shares {
        let encoded_share = share.export();
        println!(
            "Share {}: {}",
            share.metadata().index.to_char().to_ascii_uppercase(),
            encoded_share.as_str()
        );
    }
    println!();
    println!("Paste only the S secret into Sparrow; it does not combine backup shares.");
    println!("Keep the S secret private and store the shares separately.");
    println!("Codex32 does not record the network, script type, or derivation path.");

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(arguments: &[&str]) -> Result<Command, String> {
        parse_options(arguments.iter().map(|argument| (*argument).to_owned()))
    }

    #[test]
    fn defaults_to_three_shares() {
        assert_eq!(
            parse(&[]),
            Ok(Command::Generate(Options {
                threshold: 2,
                share_count: 3,
                identifier: None
            }))
        );
    }

    #[test]
    fn accepts_share_count_boundaries() {
        for count in [2, 31] {
            assert_eq!(
                parse(&["--shares", &count.to_string()]),
                Ok(Command::Generate(Options {
                    threshold: 2,
                    share_count: count,
                    identifier: None
                }))
            );
        }
    }

    #[test]
    fn accepts_identifier_and_option_order() {
        let identifier: Identifier = "sats".parse().unwrap();
        let expected = Ok(Command::Generate(Options {
            threshold: 2,
            share_count: 5,
            identifier: Some(identifier),
        }));
        assert_eq!(parse(&["--identifier", "sats", "--shares", "5"]), expected);
        assert_eq!(parse(&["--shares", "5", "--identifier", "sats"]), expected);
    }

    #[test]
    fn accepts_threshold_and_rejects_impossible_sets() {
        assert_eq!(
            parse(&["--threshold", "9", "--shares", "31"]),
            Ok(Command::Generate(Options {
                threshold: 9,
                share_count: 31,
                identifier: None,
            }))
        );
        assert!(parse(&["--threshold", "4", "--shares", "3"]).is_err());
        assert!(parse(&["--shares", "3", "--threshold", "4"]).is_err());
    }

    #[test]
    fn rejects_invalid_share_options() {
        for arguments in [
            &["--shares"][..],
            &["--shares", "one"][..],
            &["--shares", "1"][..],
            &["--shares", "32"][..],
            &["--shares", "3", "--shares", "4"][..],
            &["--threshold"][..],
            &["--threshold", "1"][..],
            &["--threshold", "10"][..],
            &["--threshold", "2", "--threshold", "3"][..],
            &["--identifier"][..],
            &["--identifier", "seedling"][..],
            &["--identifier", "sats", "--identifier", "play"][..],
            &["--unknown"][..],
        ] {
            assert!(parse(arguments).is_err(), "accepted {arguments:?}");
        }
    }

    #[test]
    fn help_is_secret_free_and_rejects_extra_arguments() {
        assert_eq!(parse(&["--help"]), Ok(Command::Help));
        assert!(parse(&["--help", "extra"]).is_err());
    }
}
