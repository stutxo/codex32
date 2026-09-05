#!/usr/bin/env python3
"""Check Rust parsing against the pinned BIP93 reference using public test data.

Requires Python 3 and the repository's Rust toolchain. The generated corpus is
temporary; no wallet material is read and no additional dependencies are needed.
"""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

from bip93_reference import ROOT, load_reference


def cases(reference):
    alphabet = reference["CHARSET"]

    def encoded_cases(payload_len, threshold, index):
        # Reproducible public test data, independent of Rust's encoder.
        label = f"PUBLIC PARSER CASE {payload_len}/{threshold}/{index}".encode()
        payload = [b & 31 for b in hashlib.shake_256(label).digest(payload_len)]
        data = [alphabet.index(c) for c in threshold + "test" + index] + payload
        encoded = reference["ms32_encode"](data)
        decoded = reference["ms32_decode"](encoded)
        expected = None
        # The reference decoder checks the string format; the master-seed rules
        # additionally require 16–64 bytes and at most four discarded bits.
        if decoded is not None and payload_len * 5 % 8 <= 4:
            seed_length = payload_len * 5 // 8
            if 16 <= seed_length <= 64:
                bits = "".join(f"{symbol:05b}" for symbol in payload)
                seed = bytes(
                    int(bits[i:i + 8], 2) for i in range(0, seed_length * 8, 8)
                )
                expected = {
                    "canonical": encoded,
                    "threshold": int(threshold),
                    "identifier": "test",
                    "index": index,
                    "seed_bytes": seed_length,
                    "seed_hex": seed.hex() if index == "s" else None,
                }
        for text in (encoded, encoded.upper()):
            yield {"encoded": text, "expected": expected}

    # Include lengths below/above supported sizes, impossible byte encodings,
    # and the gap between the short and long checksums.
    for payload_len in range(111):
        for threshold in alphabet:
            for index in "sqa":
                yield from encoded_cases(payload_len, threshold, index)
    for payload_len in (26, 27, 51, 52, 73, 74, 75, 76, 102, 103):
        for threshold in "023456789":
            for index in alphabet:
                yield from encoded_cases(payload_len, threshold, index)


def main():
    _, reference = load_reference()
    with tempfile.TemporaryDirectory(prefix="codex32-conformance-") as directory:
        corpus = Path(directory) / "parser.jsonl"
        count = 0
        with corpus.open("w") as output:
            for case in cases(reference):
                output.write(json.dumps(case) + "\n")
                count += 1
        if count != 27072:
            raise RuntimeError(f"unexpected parser corpus size: {count}")
        environment = os.environ.copy()
        environment["CODEX32_REFERENCE_CASES"] = str(corpus)
        subprocess.run(
            ["cargo", "test", "--locked", "-p", "codex32-core", "--test",
             "parser_reference", "--", "--ignored"],
            cwd=ROOT, env=environment, check=True,
        )
    print(f"Passed {count} independent BIP93 parser/export/seed-decoding cases.")


if __name__ == "__main__":
    main()
