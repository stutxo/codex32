#!/usr/bin/env python3
"""Generate public test data with the pinned BIP's independent Python reference.

This script never reads wallet material. Every generated seed is deterministic
public test data and must never hold funds. The source hash is checked before
executing the BIP's inline Python functions.
"""
import hashlib
import json
from pathlib import Path
import re

from bip93_reference import SOURCE_SHA256, load_reference

ROOT = Path(__file__).resolve().parents[1]
text, reference = load_reference()

encode = reference["ms32_encode"]
alphabet = reference["CHARSET"]
official, invalid_text = text.split("==Test Vectors==", 1)[1].split("===Invalid test vectors===", 1)
valid = sorted(set(s for s in re.findall(r"<code>(.*?)</code>", official) if s.lower().startswith("ms1")))
invalid = re.findall(r"<code>(.*?)</code>", invalid_text.split("==Appendix==")[0])
seeds = []
for section in re.split(r"===Test vector \d===", official)[1:]:
    candidates = re.findall(r"<code>(.*?)</code>", section)
    seed = next(s for s in candidates if re.fullmatch(r"[0-9a-f]{32,128}", s))
    xprv = next(s for s in candidates if s.startswith("xprv"))
    for s in candidates:
        if s.lower().startswith("ms1") and s[8].lower() == "s":
            seeds.append({"encoded": s, "hex": seed, "xprv": xprv})

cases = []
generation_cases = []
for length in range(16, 65):
    for k in range(2, 10):
        seed = hashlib.shake_256(f"PUBLIC BIP93 TEST {length}/{k}".encode()).digest(length)
        bit_string = "".join(f"{b:08b}" for b in seed)
        padding = (-len(bit_string)) % 5
        bit_string += "1" * padding  # Exercise nonzero legal padding.
        payload = [int(bit_string[i:i+5], 2) for i in range(0, len(bit_string), 5)]
        prefix = [alphabet.index(c) for c in f"{k}test"]
        secret = prefix + [alphabet.index("s")] + payload
        secret_full = secret + reference["ms32_create_checksum"](secret)
        initial = [secret_full]
        randomness = bytearray()
        indexes = [alphabet.index(c) for c in "acdefghjklmnpqrtuvwxyz023456789"]
        for j in range(k - 1):
            random_bytes = hashlib.shake_256(f"PUBLIC MASK {length}/{k}/{j}".encode()).digest(len(payload))
            randomness.extend(random_bytes)
            share = prefix + [indexes[j]] + [b & 31 for b in random_bytes]
            initial.append(share + reference["ms32_create_checksum"](share))
        shares = []
        for index in indexes[:k + 1]:
            full = initial[indexes.index(index) + 1] if index in indexes[:k - 1] else reference["ms32_interpolate"](initial, index)
            shares.append("ms1" + "".join(alphabet[v] for v in full))
        recovered = reference["ms32_recover"]([
            [alphabet.index(c) for c in s[3:]] for s in shares[-k:]
        ])
        assert recovered == secret_full
        cases.append({"hex": seed.hex(), "secret": encode(secret), "shares": shares})
        if length in [16, 32, 46, 47, 64] and k in [2, 3, 9]:
            zero_payload = payload.copy()
            if padding:
                zero_payload[-1] &= ~((1 << padding) - 1)
            zero_secret = prefix + [alphabet.index("s")] + zero_payload
            zero_initial = [zero_secret + reference["ms32_create_checksum"](zero_secret), *initial[1:]]
            expected_shares = []
            for index in indexes[:k + 1]:
                full = zero_initial[indexes.index(index) + 1] if index in indexes[:k - 1] else reference["ms32_interpolate"](zero_initial, index)
                expected_shares.append("ms1" + "".join(alphabet[v] for v in full))
            encoded_seed = encode([alphabet.index(c) for c in "0tests"] + zero_payload)
            generation_cases.append({"hex": seed.hex(), "encoded_seed": encoded_seed, "threshold": k,
                                     "randomness_hex": randomness.hex(), "shares": expected_shares})

fixture = {"source_revision": "24e96e870fffaa257b465ce1f0370c14aac588e8", "source_sha256": SOURCE_SHA256,
           "valid": valid, "invalid": invalid, "seeds": seeds, "reference_cases": cases, "generation_cases": generation_cases}
(ROOT / "tests/fixtures/bip93.json").write_text(json.dumps(fixture, indent=2) + "\n")
print(f"Generated {len(valid)} valid strings, {len(invalid)} invalid strings, {len(seeds)} seed cases, {len(cases)} independent recovery cases, and {len(generation_cases)} generation cases.")
