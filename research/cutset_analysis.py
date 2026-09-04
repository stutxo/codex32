#!/usr/bin/env python3
"""Enumerate recovery-plane compromise and availability cut sets."""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations
import json


@dataclass(frozen=True)
class Policy:
    name: str
    threshold: int
    factors: tuple[str, ...]
    user: frozenset[str]
    company: frozenset[str]
    phone: frozenset[str] = frozenset()
    independent_custodian: frozenset[str] = frozenset()


def sets_of(values: tuple[str, ...], size: int) -> list[frozenset[str]]:
    return [frozenset(items) for items in combinations(values, size)]


def analyze(policy: Policy) -> dict[str, object]:
    quorums = sets_of(policy.factors, policy.threshold)
    user_exit = [sorted(q) for q in quorums if q <= policy.user]
    company_quorums = [sorted(q) for q in quorums if q & policy.company]
    company_plus_one_user = any(
        q <= (policy.company | frozenset((user_factor,)))
        for q in quorums
        for user_factor in policy.user
    )
    phone_company_quorum = any(
        q <= (policy.phone | policy.company) for q in quorums
    )
    return {
        "name": policy.name,
        "threshold": policy.threshold,
        "factor_count": len(policy.factors),
        "minimal_theft_cutsets": len(quorums),
        "minimal_theft_sets": [sorted(q) for q in quorums],
        "minimum_losses_before_unrecoverable": len(policy.factors)
        - policy.threshold
        + 1,
        "survives_every_single_factor_loss": all(
            len(policy.factors) - 1 >= policy.threshold for _ in policy.factors
        ),
        "company_alone_recovers": len(policy.company) >= policy.threshold,
        "user_exit_quorums": user_exit,
        "company_involved_quorums": company_quorums,
        "company_plus_one_user_recovers": company_plus_one_user,
        "phone_plus_company_recovers": phone_company_quorum,
        "minimum_user_factors_with_company": max(
            0, policy.threshold - len(policy.company)
        )
        if policy.company
        else None,
    }


def main() -> None:
    policies = (
        Policy(
            "recommended-distributed-2-of-3",
            2,
            ("A:user-home", "C:user-exit", "D:company"),
            frozenset(("A:user-home", "C:user-exit")),
            frozenset(("D:company",)),
        ),
        Policy(
            "high-value-3-of-5",
            3,
            (
                "A:user-home",
                "B:user-second",
                "C:user-exit",
                "D:company",
                "E:independent-custodian",
            ),
            frozenset(("A:user-home", "B:user-second", "C:user-exit")),
            frozenset(("D:company",)),
            independent_custodian=frozenset(("E:independent-custodian",)),
        ),
        Policy(
            "all-user-2-of-3",
            2,
            ("A:user-home", "B:user-second", "C:user-exit"),
            frozenset(("A:user-home", "B:user-second", "C:user-exit")),
            frozenset(),
        ),
        Policy(
            "user-company-2-of-2",
            2,
            ("A:user-home", "D:company"),
            frozenset(("A:user-home",)),
            frozenset(("D:company",)),
        ),
        Policy(
            "phone-user-company-2-of-3",
            2,
            ("P:phone", "A:user-home", "D:company"),
            frozenset(("A:user-home",)),
            frozenset(("D:company",)),
            phone=frozenset(("P:phone",)),
        ),
    )
    results = [analyze(policy) for policy in policies]
    recommended = results[0]
    assert recommended["survives_every_single_factor_loss"] is True
    assert recommended["company_alone_recovers"] is False
    assert recommended["user_exit_quorums"] == [["A:user-home", "C:user-exit"]]
    assert recommended["minimum_user_factors_with_company"] == 1
    high_value = results[1]
    assert high_value["company_plus_one_user_recovers"] is False
    assert high_value["minimum_user_factors_with_company"] == 2
    rejected_two_of_two = results[3]
    assert rejected_two_of_two["user_exit_quorums"] == []
    rejected_phone = results[4]
    assert rejected_phone["phone_plus_company_recovers"] is True
    print(json.dumps({"schema": 1, "policies": results}, sort_keys=True))


if __name__ == "__main__":
    main()
