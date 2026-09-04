//! Harness verifier for deterministic, public Codex32 research evidence.
use codex32_core::{Codex32, derive_share, recover};
use codex32_wallet::bitcoin::{Network, bip32::Xpriv};
use serde::Deserialize;
use serde_json::json;
use std::{collections::BTreeMap, io::Read};

#[derive(Deserialize)]
struct Evidence {
    schema: u32,
    threshold: u8,
    identifier: String,
    independent_indices: Vec<String>,
    shares: Vec<EvidenceShare>,
    recoveries: Vec<EvidenceRecovery>,
}

#[derive(Deserialize)]
struct EvidenceShare {
    index: String,
    origin: String,
    codex32: String,
}

#[derive(Deserialize)]
struct EvidenceRecovery {
    indices: Vec<String>,
    seed_hex: String,
    xprv: String,
}

fn require(condition: bool, message: &str) -> Result<(), String> {
    if condition {
        Ok(())
    } else {
        Err(message.to_owned())
    }
}

fn combination_indices(length: usize, choose: usize) -> Vec<Vec<usize>> {
    fn visit(
        start: usize,
        length: usize,
        remaining: usize,
        current: &mut Vec<usize>,
        output: &mut Vec<Vec<usize>>,
    ) {
        if remaining == 0 {
            output.push(current.clone());
            return;
        }
        for index in start..=length - remaining {
            current.push(index);
            visit(index + 1, length, remaining - 1, current, output);
            current.pop();
        }
    }

    let mut output = Vec::new();
    if choose <= length {
        visit(0, length, choose, &mut Vec::new(), &mut output);
    }
    output
}

fn canonical_key(indices: &[String]) -> String {
    let mut sorted = indices.to_vec();
    sorted.sort();
    sorted.join(",")
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn verify() -> Result<serde_json::Value, String> {
    let mut input = String::new();
    std::io::stdin()
        .read_to_string(&mut input)
        .map_err(|error| error.to_string())?;
    let evidence: Evidence = serde_json::from_str(&input).map_err(|error| error.to_string())?;

    require(evidence.schema == 1, "unsupported evidence schema")?;
    require(
        (2..=9).contains(&evidence.threshold),
        "invalid evidence threshold",
    )?;
    let threshold = usize::from(evidence.threshold);
    require(
        evidence.shares.len() > threshold,
        "evidence must include at least one derived recovery share",
    )?;
    require(
        evidence.independent_indices.len() == threshold,
        "independent input count must equal the threshold",
    )?;

    let mut parsed = BTreeMap::<String, Codex32>::new();
    let mut origins = BTreeMap::<String, String>::new();
    for item in &evidence.shares {
        require(
            item.index.chars().count() == 1,
            "share index must be one character",
        )?;
        let share: Codex32 = item
            .codex32
            .parse()
            .map_err(|error| format!("invalid share {}: {error}", item.index))?;
        let metadata = share.metadata();
        require(
            metadata.threshold == evidence.threshold,
            "share threshold differs from evidence threshold",
        )?;
        require(
            metadata.identifier.to_string() == evidence.identifier,
            "share identifier differs from evidence identifier",
        )?;
        require(
            metadata.index.to_char().to_string() == item.index,
            "declared share index differs from encoded index",
        )?;
        require(
            parsed.insert(item.index.clone(), share).is_none(),
            "duplicate share index",
        )?;
        origins.insert(item.index.clone(), item.origin.clone());
    }

    let mut independent = Vec::with_capacity(threshold);
    for index in &evidence.independent_indices {
        require(
            origins.get(index).map(String::as_str) == Some("independent"),
            "independent input is missing or has the wrong origin",
        )?;
        independent.push(parsed[index].clone());
    }
    let independent_set: std::collections::BTreeSet<_> =
        evidence.independent_indices.iter().cloned().collect();
    require(
        independent_set.len() == threshold,
        "independent input indices are not distinct",
    )?;

    let mut derived_verified = 0usize;
    for (index, share) in &parsed {
        if independent_set.contains(index) {
            continue;
        }
        require(
            origins.get(index).map(String::as_str) == Some("derived"),
            "non-input share must be marked derived",
        )?;
        let derived = derive_share(&independent, share.metadata().index)
            .map_err(|error| format!("could not derive share {index}: {error}"))?;
        require(
            derived.export().as_str() == share.export().as_str(),
            "derived share does not match interpolation",
        )?;
        derived_verified += 1;
    }
    require(derived_verified > 0, "no derived share was verified")?;

    let mut declared_recoveries = BTreeMap::new();
    for item in &evidence.recoveries {
        let key = canonical_key(&item.indices);
        require(
            declared_recoveries.insert(key, item).is_none(),
            "duplicate declared recovery combination",
        )?;
    }

    let ordered: Vec<_> = parsed.iter().collect();
    let combinations = combination_indices(ordered.len(), threshold);
    require(
        declared_recoveries.len() == combinations.len(),
        "recovery evidence does not cover every threshold combination",
    )?;
    let mut expected_seed = None::<String>;
    let mut expected_xprv = None::<String>;
    for positions in &combinations {
        let indices: Vec<_> = positions
            .iter()
            .map(|position| ordered[*position].0.clone())
            .collect();
        let shares: Vec<_> = positions
            .iter()
            .map(|position| ordered[*position].1.clone())
            .collect();
        let recovered = recover(&shares).map_err(|error| error.to_string())?;
        let seed = recovered.secret_seed().map_err(|error| error.to_string())?;
        let actual_seed = hex(seed.expose_secret());
        let actual_xprv = Xpriv::new_master(Network::Bitcoin, seed.expose_secret())
            .map_err(|error| error.to_string())?
            .to_string();
        let declared = declared_recoveries
            .get(&canonical_key(&indices))
            .ok_or_else(|| "missing recovery combination".to_owned())?;
        require(
            declared.seed_hex.eq_ignore_ascii_case(&actual_seed),
            "declared recovered seed is incorrect",
        )?;
        require(
            declared.xprv == actual_xprv,
            "declared BIP32 key is incorrect",
        )?;
        if let Some(expected) = &expected_seed {
            require(
                expected == &actual_seed,
                "recovery combinations produced different seeds",
            )?;
        } else {
            expected_seed = Some(actual_seed);
        }
        if let Some(expected) = &expected_xprv {
            require(
                expected == &actual_xprv,
                "recovery combinations produced different BIP32 keys",
            )?;
        } else {
            expected_xprv = Some(actual_xprv);
        }
    }

    Ok(json!({
        "shares_verified": parsed.len(),
        "derived_verified": derived_verified,
        "combinations_verified": combinations.len(),
        "all_same_seed": true,
        "all_same_xprv": true
    }))
}

fn main() {
    match verify() {
        Ok(result) => println!("{result}"),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
