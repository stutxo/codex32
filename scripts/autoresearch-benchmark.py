#!/usr/bin/env python3
"""Deterministic acceptance benchmark for the Codex32 recovery research."""

from __future__ import annotations

import hashlib
import itertools
import json
import math
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CARGO = ["cargo", "run", "--locked", "--offline", "--quiet"]


def run(command: list[str], stdin: str | None = None) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.update(
        {
            "CARGO_NET_OFFLINE": "true",
            "LC_ALL": "C",
            "TZ": "UTC",
            "SOURCE_DATE_EPOCH": "0",
        }
    )
    return subprocess.run(
        command,
        cwd=ROOT,
        env=env,
        input=stdin,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=240,
        check=False,
    )


def verifier(evidence: str) -> tuple[dict[str, Any] | None, str]:
    result = run(
        CARGO
        + [
            "-p",
            "codex32-wallet",
            "--example",
            "autoresearch_verify",
        ],
        evidence,
    )
    if result.returncode != 0:
        return None, result.stderr.strip()
    try:
        return json.loads(result.stdout), ""
    except json.JSONDecodeError as error:
        return None, f"verifier emitted invalid JSON: {error}"


def load_json(path: Path) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def weighted_score(checks: list[tuple[str, bool, int]], maximum: int) -> tuple[int, list[str]]:
    total = sum(weight for _, _, weight in checks)
    earned = sum(weight for _, passed, weight in checks if passed)
    score = round(maximum * earned / total) if total else 0
    return score, [name for name, passed, _ in checks if not passed]


def architecture_score() -> tuple[int, list[str]]:
    model = load_json(ROOT / "research" / "architecture.json")
    if model is None:
        return 0, ["architecture_model_missing"]

    codex = model.get("codex32", {})
    components_raw = model.get("components", [])
    shares_raw = codex.get("shares", []) if isinstance(codex, dict) else []
    paths = model.get("recovery_paths", [])
    channels = model.get("channels", [])
    spending = model.get("normal_spending", {})
    components = {
        item.get("id"): item
        for item in components_raw
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    shares = {
        item.get("id"): item
        for item in shares_raw
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    k = codex.get("threshold", -1) if isinstance(codex, dict) else -1

    def stored_shares(component: dict[str, Any]) -> set[str]:
        stores = component.get("stores", [])
        return {
            value.removeprefix("share:")
            for value in stores
            if isinstance(value, str) and value.startswith("share:")
        }

    def holders(share_id: str) -> list[dict[str, Any]]:
        share = shares.get(share_id, {})
        holder_ids = share.get("holders", []) if isinstance(share, dict) else []
        return [components[item] for item in holder_ids if item in components]

    valid_threshold = isinstance(k, int) and 2 <= k <= 9
    valid_indices = all(
        isinstance(item.get("index"), str)
        and len(item["index"]) == 1
        and item["index"] in "acdefghjklmnpqrtuvwxyz023456789"
        for item in shares.values()
    )
    distinct_indices = len({item.get("index") for item in shares.values()}) == len(shares)
    holder_refs_valid = bool(shares) and all(
        item.get("holders")
        and all(holder in components for holder in item.get("holders", []))
        for item in shares.values()
    )
    holdings_consistent = holder_refs_valid and all(
        share_id in stored_shares(components[holder])
        for share_id, item in shares.items()
        for holder in item.get("holders", [])
    )

    company_components = [item for item in components.values() if item.get("owner") == "company"]
    company_shares = set().union(*(stored_shares(item) for item in company_components)) if company_components else set()
    company_below_threshold = valid_threshold and len(company_shares) < k
    single_component_below_threshold = valid_threshold and all(
        len(stored_shares(item)) < k for item in components.values()
    )

    user_offline_shares = set().union(
        *(
            stored_shares(item)
            for item in components.values()
            if item.get("owner") == "user" and item.get("class") == "offline_physical"
        )
    ) if components else set()
    user_exit_quorum = valid_threshold and len(user_offline_shares) >= k

    def valid_path(path: Any) -> bool:
        if not isinstance(path, dict):
            return False
        path_shares = path.get("shares", [])
        target = components.get(path.get("reconstructs_on"), {})
        return (
            valid_threshold
            and isinstance(path_shares, list)
            and len(set(path_shares)) >= k
            and all(item in shares for item in path_shares)
            and target.get("class") == "dedicated_hardware"
        )

    valid_paths = [path for path in paths if valid_path(path)] if isinstance(paths, list) else []

    assisted_paths = []
    exit_paths = []
    for path in valid_paths:
        path_shares = path["shares"]
        has_company = any(any(holder.get("owner") == "company" for holder in holders(item)) for item in path_shares)
        has_user = any(any(holder.get("owner") == "user" for holder in holders(item)) for item in path_shares)
        if path.get("company_involved") is True and has_company and has_user:
            assisted_paths.append(path)
        if path.get("company_involved") is False and all(
            any(holder.get("owner") == "user" for holder in holders(item)) for item in path_shares
        ):
            exit_paths.append(path)

    normal_required = spending.get("required_components", []) if isinstance(spending, dict) else []
    ordinary_spending = (
        isinstance(spending, dict)
        and spending.get("script_type") in {"p2wpkh", "p2tr-keypath"}
        and isinstance(normal_required, list)
        and bool(normal_required)
        and all(item in components for item in normal_required)
        and any(components[item].get("class") == "dedicated_hardware" for item in normal_required if item in components)
    )
    company_absent_spending = (
        ordinary_spending
        and spending.get("company_involved") is False
        and spending.get("recovery_components_involved") is False
        and all(components[item].get("owner") != "company" for item in normal_required)
    )

    signer_ids = {
        component_id
        for component_id, item in components.items()
        if "normal_signer" in item.get("roles", [])
    }
    signer_replacement = any(
        path.get("reconstructs_on") not in signer_ids
        and signer_ids.isdisjoint(path.get("required_components", []))
        for path in valid_paths
    )
    single_share_loss_tolerated = bool(shares) and all(
        any(share_id not in path.get("shares", []) for path in valid_paths)
        for share_id in shares
    )

    prohibited_seed_classes = {"general_purpose", "company_server", "cloud_host", "public_ledger", "offline_physical"}
    no_general_seed = all(
        "seed" not in item.get("stores", []) or item.get("class") not in prohibited_seed_classes
        for item in components.values()
    )
    no_plaintext_public_share = all(
        not stored_shares(item) for item in components.values() if item.get("class") == "public_ledger"
    )

    private_transport = False
    for path in assisted_paths:
        target = path.get("reconstructs_on")
        company_path_shares = [
            item
            for item in path.get("shares", [])
            if any(holder.get("owner") == "company" for holder in holders(item))
        ]
        for channel in channels if isinstance(channels, list) else []:
            if not isinstance(channel, dict):
                continue
            if (
                channel.get("to") == target
                and channel.get("end_to_end_encrypted") is True
                and channel.get("payload") in {f"share:{item}" for item in company_path_shares}
                and components.get(channel.get("from"), {}).get("owner") == "company"
            ):
                private_transport = True

    checks = [
        ("architecture_schema", model.get("schema") == 1 and isinstance(codex, dict), 3),
        ("codex32_threshold", valid_threshold and len(shares) >= k, 3),
        ("share_indices", valid_indices and distinct_indices, 2),
        ("share_holders", holder_refs_valid and holdings_consistent, 3),
        ("company_below_threshold", company_below_threshold, 4),
        ("single_component_below_threshold", single_component_below_threshold, 4),
        ("user_exit_quorum", user_exit_quorum, 4),
        ("assisted_recovery", bool(assisted_paths), 4),
        ("company_independent_recovery", bool(exit_paths), 4),
        ("replacement_signer_recovery", signer_replacement, 3),
        ("single_share_loss_tolerated", single_share_loss_tolerated, 3),
        ("ordinary_spending", ordinary_spending, 3),
        ("company_absent_spending", company_absent_spending, 3),
        ("seed_confined_to_hardware", no_general_seed, 3),
        ("private_assisted_transport", private_transport, 2),
        ("no_plaintext_public_share", no_plaintext_public_share, 2),
    ]
    return weighted_score(checks, 40)


def prototype_score() -> tuple[int, int, list[str]]:
    source = ROOT / "crates" / "codex32-core" / "examples" / "distributed_recovery.rs"
    if not source.is_file():
        return 0, 0, ["prototype_executable_missing"]

    execution = run(CARGO + ["-p", "codex32-core", "--example", "distributed_recovery"])
    if execution.returncode != 0:
        return 0, 0, ["prototype_execution_failed"]
    try:
        evidence = json.loads(execution.stdout)
    except json.JSONDecodeError:
        return 0, 0, ["prototype_output_invalid_json"]
    if not isinstance(evidence, dict):
        return 0, 0, ["prototype_output_not_object"]

    verified, verify_error = verifier(execution.stdout)
    verifier_ok = verified is not None
    if not verifier_ok:
        print(f"CHECK prototype_verifier: {verify_error}", file=sys.stderr)
        verified = {}

    threshold = evidence.get("threshold")
    shares = evidence.get("shares", [])
    independent = evidence.get("independent_indices", [])
    contributions = evidence.get("contributions", [])
    trace = evidence.get("trace", [])
    n = len(shares) if isinstance(shares, list) else 0
    k = threshold if isinstance(threshold, int) else 0
    expected_combinations = math.comb(n, k) if 0 <= k <= n else 0
    combinations_verified = int(verified.get("combinations_verified", 0))

    share_by_index = {
        item.get("index"): item
        for item in shares
        if isinstance(item, dict) and isinstance(item.get("index"), str)
    }
    contribution_indices: set[str] = set()
    commitments_match = bool(contributions)
    contribution_components: set[str] = set()
    for item in contributions if isinstance(contributions, list) else []:
        if not isinstance(item, dict):
            commitments_match = False
            continue
        index = item.get("index")
        component = item.get("component")
        payload = item.get("payload")
        share = share_by_index.get(index, {})
        encoded = share.get("codex32", "") if isinstance(share, dict) else ""
        if not all(isinstance(value, str) for value in [index, component, payload, encoded]):
            commitments_match = False
            continue
        encoded = encoded.lower()
        checksum_length = 13 if len(encoded) - 3 <= 93 else 15
        encoded_payload = encoded[9:-checksum_length] if len(encoded) > 9 + checksum_length else ""
        material = f"codex32-distributed-v1|{k}|{evidence.get('identifier')}|{index}|{payload}".encode()
        expected_commitment = hashlib.sha256(material).hexdigest()
        commitments_match &= payload == encoded_payload and item.get("commitment") == expected_commitment
        contribution_indices.add(index)
        contribution_components.add(component)

    well_formed_trace = isinstance(trace, list) and bool(trace) and all(
        isinstance(item, dict)
        and isinstance(item.get("order"), int)
        and isinstance(item.get("stage"), str)
        and isinstance(item.get("component"), str)
        and isinstance(item.get("component_class"), str)
        and isinstance(item.get("owner"), str)
        and isinstance(item.get("possesses"), list)
        for item in trace
    )
    stages = {item.get("stage") for item in trace if isinstance(item, dict)} if isinstance(trace, list) else set()
    commit_orders = [item["order"] for item in trace if isinstance(item, dict) and item.get("stage") == "commit"]
    reveal_orders = [item["order"] for item in trace if isinstance(item, dict) and item.get("stage") == "reveal"]
    commit_before_reveal = bool(commit_orders and reveal_orders) and max(commit_orders) < min(reveal_orders)

    trace_policy_ok = well_formed_trace
    for item in trace if isinstance(trace, list) else []:
        if not isinstance(item, dict):
            trace_policy_ok = False
            continue
        possessions = item.get("possesses", [])
        share_count = len({value for value in possessions if isinstance(value, str) and value.startswith("share:")})
        if "seed" in possessions and item.get("component_class") != "dedicated_hardware":
            trace_policy_ok = False
        if valid_threshold := (isinstance(threshold, int) and 2 <= threshold <= 9):
            if item.get("component_class") != "dedicated_hardware" and share_count >= threshold:
                trace_policy_ok = False
        else:
            trace_policy_ok = False

    checks = [
        ("prototype_executes", True, 2),
        ("cryptographic_verifier", verifier_ok, 5),
        ("prototype_threshold", isinstance(threshold, int) and 2 <= threshold <= 9, 2),
        ("threshold_has_redundancy", k >= 2 and n > k, 2),
        ("independent_input_count", isinstance(independent, list) and len(set(independent)) == k, 3),
        ("derived_share_verified", int(verified.get("derived_verified", 0)) >= 1, 3),
        ("all_combinations_verified", expected_combinations > 1 and combinations_verified == expected_combinations, 5),
        ("identical_bip32_secret", bool(verified.get("all_same_seed")) and bool(verified.get("all_same_xprv")), 3),
        ("contributions_cover_inputs", contribution_indices == set(independent) and len(contribution_components) == k, 2),
        ("commitments_match_payloads", commitments_match, 3),
        ("commit_before_reveal", commit_before_reveal, 2),
        ("trace_covers_protocol", {"generate", "commit", "reveal", "derive", "recover"} <= stages, 1),
        ("trace_secret_policy", trace_policy_ok, 3),
        ("trace_is_complete", well_formed_trace, 1),
    ]
    score, failures = weighted_score(checks, 35)
    return score, combinations_verified, failures


REPORT_HEADINGS = [
    "Codex32 for the product",
    "Architectures investigated",
    "Experimental discoveries",
    "Recommended architecture",
    "Architecture diagram",
    "Wallet creation protocol",
    "Backup protocol",
    "Recovery protocol",
    "Secret location map",
    "Hardware requirements",
    "TEE and server requirements",
    "Threat model",
    "Failure and disaster recovery",
    "Prototype",
    "Remaining research questions",
    "Expert-review security assumptions",
    "Features not to build",
    "Smallest viable product",
]


def report_score() -> tuple[int, list[str]]:
    path = ROOT / "research" / "report.md"
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return 0, ["research_report_missing"]
    lowered = text.lower()
    checks: list[tuple[str, bool, int]] = []
    for heading in REPORT_HEADINGS:
        pattern = rf"(?mi)^#{{1,4}}\s+(?:\d+\.\s+)?{re.escape(heading)}\s*$"
        checks.append((f"report_section_{heading.lower().replace(' ', '_')}", re.search(pattern, text) is not None, 1))
    source_checks = {
        "bip93_primary_source": "github.com/bitcoin/bips" in lowered and "bip-0093" in lowered,
        "codex32_reference_source": "blockstreamresearch/codex32" in lowered or "apoelstra/rust-codex32" in lowered,
        "nitro_primary_source": "docs.aws.amazon.com" in lowered and "nitro" in lowered,
        "hardware_primary_source": "github.com/trezor/trezor-firmware" in lowered
        or "github.com/blockstream/jade" in lowered
        or "github.com/coldcard/firmware" in lowered,
    }
    checks.extend((name, passed, 1) for name, passed in source_checks.items())
    checks.extend(
        [
            ("architecture_comparison_table", re.search(r"(?mi)^\|\s*architecture\s*\|", text) is not None, 1),
            ("threat_outcome_table", "attacker obtains" in lowered and "additional" in lowered and "recovery" in lowered, 1),
            ("reproducible_prototype_command", "cargo run" in lowered and "distributed_recovery" in lowered, 1),
        ]
    )
    return weighted_score(checks, 25)


def main() -> int:
    smoke_path = ROOT / "scripts" / "fixtures" / "autoresearch-smoke.json"
    try:
        smoke = smoke_path.read_text(encoding="utf-8")
    except OSError as error:
        print(f"benchmark fixture unavailable: {error}", file=sys.stderr)
        return 1
    smoke_result, smoke_error = verifier(smoke)
    if smoke_result is None:
        print(f"benchmark verifier failed: {smoke_error}", file=sys.stderr)
        return 1
    if smoke_result.get("combinations_verified") != 3 or smoke_result.get("derived_verified") != 1:
        print("benchmark verifier did not exercise the fixed recovery matrix", file=sys.stderr)
        return 1

    architecture, architecture_failures = architecture_score()
    prototype, combinations, prototype_failures = prototype_score()
    report, report_failures = report_score()
    assurance = architecture + prototype + report

    failures = architecture_failures + prototype_failures + report_failures
    print("CHECK failures=" + ",".join(failures))
    print(f"METRIC assurance_score={assurance}")
    print(f"METRIC architecture_score={architecture}")
    print(f"METRIC prototype_score={prototype}")
    print(f"METRIC report_score={report}")
    print(f"METRIC recovery_combinations={combinations}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
