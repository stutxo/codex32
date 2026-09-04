//! A printable public-fixture demo. These addresses must never receive real funds.
use codex32_core::Codex32;
use codex32_wallet::{CodexWallet, bitcoin::Network};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let shares: Vec<Codex32> = [
        "MS12NAMEA320ZYXWVUTSRQPNMLKJHGFEDCAXRPP870HKKQRM",
        "MS12NAMECACDEFGHJKLMNPQRSTUVWXYZ023FTR2GDZMPY6PN",
    ]
    .iter()
    .map(|s| s.parse())
    .collect::<Result<_, _>>()?;
    let wallet = CodexWallet::restore(&shares, Network::Regtest)?;
    println!("Codex32 public practice wallet · regtest only");
    println!("Recovered BIP 93 example NAME from two shares.");
    println!("Receive: {}", wallet.address(false, 0)?);
    println!("Change:  {}", wallet.address(true, 0)?);
    Ok(())
}
