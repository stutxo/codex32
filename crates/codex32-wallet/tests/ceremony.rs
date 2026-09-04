use codex32_core::{Codex32, ShareIndex, generate_share, recover};
use codex32_wallet::{
    CodexWallet,
    bitcoin::Network,
    ceremony::{
        CeremonyContext, CeremonyError, CeremonyState, ContributionRole, CreationCeremony,
    },
};
use rand_core::{TryCryptoRng, TryRngCore};

#[derive(Debug)]
struct ByteRng(u8);

impl TryRngCore for ByteRng {
    type Error = core::convert::Infallible;

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
            self.0 = self.0.wrapping_add(17);
        }
        Ok(())
    }
}

impl TryCryptoRng for ByteRng {}

fn context(expires_at: u64) -> CeremonyContext {
    CeremonyContext::new(
        "dkg2".parse().unwrap(),
        [1; 32],
        [2; 32],
        [3; 32],
        expires_at,
    )
    .unwrap()
}

fn contributions() -> (Codex32, Codex32) {
    let identifier = "dkg2".parse().unwrap();
    let hardware = generate_share(
        32,
        identifier,
        2,
        ShareIndex::from_char('a').unwrap(),
        &mut ByteRng(11),
    )
    .unwrap();
    let company = generate_share(
        32,
        identifier,
        2,
        ShareIndex::from_char('d').unwrap(),
        &mut ByteRng(29),
    )
    .unwrap();
    (hardware, company)
}

#[test]
fn committed_ceremony_produces_the_complete_recovery_matrix() {
    let context = context(1_000);
    let (hardware, company) = contributions();
    let company_commitment = context
        .contribution_commitment(ContributionRole::Company, &company)
        .unwrap();
    let mut ceremony = CreationCeremony::begin(context, &hardware, 900).unwrap();
    assert_eq!(ceremony.state(), CeremonyState::HardwareCommitted);
    let delivery_aad = ceremony
        .lock_company_commitment(company_commitment, 901)
        .unwrap();
    assert_eq!(delivery_aad, ceremony.delivery_aad(902).unwrap());
    ceremony
        .accept_company_share(&company, delivery_aad, 903)
        .unwrap();
    let finalized = ceremony.finalize(&hardware, &company, 904).unwrap();
    assert_eq!(ceremony.state(), CeremonyState::Finalized);

    let expected = finalized.recovered_secret().secret_seed().unwrap();
    for pair in [
        [hardware.clone(), company.clone()],
        [hardware, finalized.user_exit().clone()],
        [company, finalized.user_exit().clone()],
    ] {
        assert_eq!(
            recover(&pair)
                .unwrap()
                .secret_seed()
                .unwrap()
                .expose_secret(),
            expected.expose_secret()
        );
    }
    let debug = format!("{finalized:?}");
    assert!(debug.contains("[REDACTED]"));
    assert!(!debug.contains(finalized.user_exit().export().as_str()));
}
#[test]
fn company_loss_exit_preserves_the_assisted_wallet_identity() {
    let context = context(1_000);
    let (hardware, company) = contributions();
    let company_commitment = context
        .contribution_commitment(ContributionRole::Company, &company)
        .unwrap();
    let mut ceremony = CreationCeremony::begin(context, &hardware, 900).unwrap();
    let aad = ceremony
        .lock_company_commitment(company_commitment, 901)
        .unwrap();
    ceremony
        .accept_company_share(&company, aad, 902)
        .unwrap();
    let finalized = ceremony.finalize(&hardware, &company, 903).unwrap();
    let exit = finalized.user_exit().clone();

    let assisted_home =
        CodexWallet::restore(&[hardware.clone(), company.clone()], Network::Signet).unwrap();
    let assisted_remote =
        CodexWallet::restore(&[exit.clone(), company], Network::Signet).unwrap();
    let company_absent =
        CodexWallet::restore(&[hardware, exit], Network::Signet).unwrap();
    assert_eq!(
        company_absent.wallet_identity(),
        assisted_home.wallet_identity()
    );
    assert_eq!(
        company_absent.wallet_identity(),
        assisted_remote.wallet_identity()
    );
    assert_eq!(
        company_absent.address(false, 0).unwrap(),
        assisted_home.address(false, 0).unwrap()
    );
}

#[test]
fn contributions_and_delivery_bind_every_session_context_field() {
    let base = context(1_000);
    let (hardware, company) = contributions();
    let base_commitment = base
        .contribution_commitment(ContributionRole::Company, &company)
        .unwrap();
    let variants = [
        CeremonyContext::new(
            "dkg2".parse().unwrap(),
            [9; 32],
            [2; 32],
            [3; 32],
            1_000,
        )
        .unwrap(),
        CeremonyContext::new(
            "dkg2".parse().unwrap(),
            [1; 32],
            [9; 32],
            [3; 32],
            1_000,
        )
        .unwrap(),
        CeremonyContext::new(
            "dkg2".parse().unwrap(),
            [1; 32],
            [2; 32],
            [9; 32],
            1_000,
        )
        .unwrap(),
        context(1_001),
    ];

    let mut base_ceremony = CreationCeremony::begin(base, &hardware, 900).unwrap();
    let base_aad = base_ceremony
        .lock_company_commitment(base_commitment, 901)
        .unwrap();
    for variant in variants {
        let variant_commitment = variant
            .contribution_commitment(ContributionRole::Company, &company)
            .unwrap();
        assert_ne!(variant_commitment, base_commitment);
        let mut variant_ceremony =
            CreationCeremony::begin(variant, &hardware, 900).unwrap();
        let variant_aad = variant_ceremony
            .lock_company_commitment(base_commitment, 901)
            .unwrap();
        assert_ne!(variant_aad, base_aad);
        assert_eq!(
            variant_ceremony.accept_company_share(&company, variant_aad, 902),
            Err(CeremonyError::Commitment)
        );
    }
}

#[test]
fn malformed_contribution_metadata_fails_before_commitment_acceptance() {
    let context = context(1_000);
    let (hardware, company) = contributions();
    assert_eq!(
        context.contribution_commitment(ContributionRole::Hardware, &company),
        Err(CeremonyError::ContributionMetadata)
    );
    assert_eq!(
        context.contribution_commitment(ContributionRole::Company, &hardware),
        Err(CeremonyError::ContributionMetadata)
    );

    let cases = [
        generate_share(
            32,
            "test".parse().unwrap(),
            2,
            ShareIndex::from_char('d').unwrap(),
            &mut ByteRng(41),
        )
        .unwrap(),
        generate_share(
            32,
            "dkg2".parse().unwrap(),
            3,
            ShareIndex::from_char('d').unwrap(),
            &mut ByteRng(42),
        )
        .unwrap(),
        generate_share(
            16,
            "dkg2".parse().unwrap(),
            2,
            ShareIndex::from_char('d').unwrap(),
            &mut ByteRng(43),
        )
        .unwrap(),
        generate_share(
            32,
            "dkg2".parse().unwrap(),
            2,
            ShareIndex::from_char('c').unwrap(),
            &mut ByteRng(44),
        )
        .unwrap(),
    ];
    for malformed in cases {
        assert_eq!(
            context.contribution_commitment(ContributionRole::Company, &malformed),
            Err(CeremonyError::ContributionMetadata)
        );
    }
    assert_eq!(
        CreationCeremony::begin(context, &hardware, 1_001).unwrap_err(),
        CeremonyError::Expired
    );
}


#[test]
fn tamper_expiry_wrong_order_and_replay_fail_closed() {
    let ctx = context(1_000);
    let (hardware, company) = contributions();
    let commitment = ctx
        .contribution_commitment(ContributionRole::Company, &company)
        .unwrap();
    let mut ceremony = CreationCeremony::begin(ctx, &hardware, 900).unwrap();

    assert_eq!(
        ceremony.accept_company_share(&company, [0; 32], 901),
        Err(CeremonyError::State)
    );
    let mut aad = ceremony.lock_company_commitment(commitment, 902).unwrap();
    aad[0] ^= 1;
    assert_eq!(
        ceremony.accept_company_share(&company, aad, 903),
        Err(CeremonyError::DeliveryBinding)
    );
    assert_eq!(ceremony.state(), CeremonyState::CommitmentsLocked);

    let (_, different_company) = {
        let identifier = "dkg2".parse().unwrap();
        let different = generate_share(
            32,
            identifier,
            2,
            ShareIndex::from_char('d').unwrap(),
            &mut ByteRng(77),
        )
        .unwrap();
        (hardware.clone(), different)
    };
    let correct_aad = ceremony.delivery_aad(904).unwrap();
    assert_eq!(
        ceremony.accept_company_share(&different_company, correct_aad, 905),
        Err(CeremonyError::Commitment)
    );
    ceremony
        .accept_company_share(&company, correct_aad, 906)
        .unwrap();
    assert_eq!(
        ceremony.accept_company_share(&company, correct_aad, 907),
        Err(CeremonyError::State)
    );
    ceremony.finalize(&hardware, &company, 908).unwrap();
    assert!(matches!(
        ceremony.finalize(&hardware, &company, 909),
        Err(CeremonyError::State)
    ));

    let mut expired = CreationCeremony::begin(context(910), &hardware, 910).unwrap();
    assert_eq!(
        expired.lock_company_commitment(commitment, 911),
        Err(CeremonyError::Expired)
    );
    assert_eq!(
        CeremonyContext::new("dkg2".parse().unwrap(), [0; 32], [2; 32], [3; 32], 1),
        Err(CeremonyError::Binding)
    );
}
