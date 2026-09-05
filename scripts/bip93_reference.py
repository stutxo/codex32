"""Load only the repository's hash-pinned BIP93 Python reference functions."""

import hashlib
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA256 = "45b1758805014b121145765c4e551486347433c7872e1b3277c26815728be5a5"


def load_reference():
    source = (ROOT / "tests/fixtures/bip-0093.mediawiki").read_bytes()
    if hashlib.sha256(source).hexdigest() != SOURCE_SHA256:
        raise ValueError("pinned BIP93 source hash mismatch")
    text = source.decode()
    reference = {}
    for snippet in re.findall(r'<source lang="python">(.*?)</source>', text, re.S):
        exec(compile(snippet, "pinned-bip93-reference", "exec"), reference)
    return text, reference
