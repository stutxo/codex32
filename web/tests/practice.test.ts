import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as engine from "../lib/wasm/codex32_wasm.js";
import { checkShare, grouped, practice, recoverPractice, shares } from "../lib/practice.ts";
import { recoveryTool } from "../lib/webmcp.ts";

engine.initSync({
  module: await readFile(new URL("../lib/wasm/codex32_wasm_bg.wasm", import.meta.url)),
});

await test("every public pair, in either order, matches the published secret and independent addresses", () => {
  for (const pair of [
    ["A", "C"],
    ["A", "D"],
    ["C", "D"],
  ]) {
    for (const indices of [pair, [...pair].reverse()]) {
      const result = recoverPractice(engine, indices);
      assert.equal(result.secret, practice.expectedSecret);
      assert.deepEqual(
        result.addresses.map((a) => a.address),
        practice.addresses.map((a) => a.address),
      );
      assert.deepEqual(result.indices, indices);
    }
  }
});
await test("recovery rejects incomplete, excessive, duplicate, secret, and unknown share choices", () => {
  for (const invalid of [
    [],
    ["A"],
    ["A", "C", "D"],
    ["A", "A"],
    ["A", "S"],
    ["A", "Z"],
    ["a", "c"],
    null,
    "AC",
    [1, 2],
  ]) {
    assert.throws(() => recoverPractice(engine, invalid), /exactly two different/);
  }
});
await test("the wallet comparison fails closed when an address differs", () => {
  const faultyEngine = {
    ...engine,
    RecoveryWallet: class extends engine.RecoveryWallet {
      address(change: boolean, index: number) {
        return index === 1 ? "incorrect-address" : super.address(change, index);
      }
    },
  };
  assert.throws(() => recoverPractice(faultyEngine, ["A", "C"]), /addresses did not match/);
});
await test("grouped, wrapped, uppercase and lowercase public shares all decode with their real metadata", () => {
  for (const share of shares) {
    for (const input of [
      share.text,
      share.text.toLowerCase(),
      grouped(share.text),
      "\t" + grouped(share.text).replaceAll(" ", "\r\n") + "\n",
    ]) {
      assert.deepEqual(checkShare(engine, input), {
        ok: true,
        identifier: "name",
        index: share.index.toLowerCase(),
        threshold: 2,
        seedBytes: 16,
        isSecret: false,
        knownExample: true,
      });
    }
  }
});
await test("S is recognized as a complete secret even with a nonzero backup threshold", () => {
  const result = checkShare(engine, practice.publishedSecret);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.isSecret, true);
    assert.equal(result.threshold, 2);
  }
});
await test("checksum errors and mixed case are detected without silent correction", () => {
  const typo = checkShare(engine, shares[0].text.slice(0, -1) + "Q");
  assert.equal(typo.ok, false);
  if (!typo.ok) assert.match(typo.message, /checksum/);
  const mixed = checkShare(engine, "m" + shares[0].text.slice(1));
  assert.equal(mixed.ok, false);
  if (!mixed.ok) assert.match(mixed.message, /uppercase or all lowercase/);
});
await test("empty, oversize, Unicode, and punctuation inputs fail without reflecting input in errors", () => {
  for (const input of [
    "",
    " \n\t",
    "PRIVATE-INPUT-" + "x".repeat(1200),
    "🔑".repeat(30),
    shares[0].text + "-",
  ]) {
    const result = checkShare(engine, input);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(!result.message.includes("PRIVATE-INPUT"));
  }
});
await test("a valid unrelated public vector is not identified as the built-in practice wallet", () => {
  const result = checkShare(engine, "ms10testsxxxxxxxxxxxxxxxxxxxxxxxxxx4nzvca9cmczlw");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.knownExample, false);
    assert.equal(result.isSecret, true);
  }
});
await test("agent recovery contract uses real recovery and rejects invalid requests before mutation", async () => {
  let state: ReturnType<typeof recoverPractice> | undefined;
  const tool = recoveryTool(async (indices) => {
    state = recoverPractice(engine, indices);
    return { matches: state.addresses.length };
  });
  assert.equal(tool.name, "recover_public_practice");
  assert.deepEqual(tool.annotations, { readOnlyHint: false, untrustedContentHint: false });
  assert.deepEqual(await tool.execute({ shareIndices: ["C", "D"] }), { matches: 3 });
  assert.deepEqual(state?.indices, ["C", "D"]);
  const previous = state;
  for (const invalid of [
    { shareIndices: ["A", "A"] },
    { shareIndices: ["A", "C"], secret: "unused" },
    { shares: ["A", "C"] },
    null,
  ]) {
    assert.throws(() => tool.execute(invalid));
    assert.equal(state, previous);
  }
});
