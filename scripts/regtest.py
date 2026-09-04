#!/usr/bin/env python3
"""Run the Rust wallet journey against an isolated, temporary Bitcoin Core node.

Requires bitcoind, bitcoin-cli, and cargo on PATH. No existing node or wallet is
used. The node has no P2P networking and only binds RPC on localhost.
"""
import json
import os
from pathlib import Path
import selectors
import shutil
import socket
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]

def read_event(process):
    with selectors.DefaultSelector() as selector:
        selector.register(process.stdout, selectors.EVENT_READ)
        if not selector.select(timeout=45):
            raise TimeoutError("wallet driver did not respond")
    line = process.stdout.readline()
    if not line:
        raise RuntimeError(f"wallet driver exited with status {process.poll()}")
    return json.loads(line)

def send_event(process, event):
    process.stdin.write(json.dumps(event) + "\n")
    process.stdin.flush()

def main():
    for binary in ["bitcoind", "bitcoin-cli", "cargo"]:
        if not shutil.which(binary):
            raise SystemExit(f"Missing required program: {binary}")
    subprocess.run(["cargo", "build", "--locked", "-p", "codex32-wallet", "--example", "regtest"], cwd=ROOT, check=True)
    with tempfile.TemporaryDirectory(prefix="codex32-regtest-") as temporary:
        directory = Path(temporary)
        os.chmod(directory, 0o700)
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        base = [f"-datadir={directory}", "-regtest", f"-rpcport={port}"]
        def rpc(method, *arguments, wallet=None):
            command = ["bitcoin-cli", *base, "-rpcwait", "-rpcwaittimeout=30"]
            if wallet:
                command.append(f"-rpcwallet={wallet}")
            command.extend([method, *(json.dumps(a) if isinstance(a, (dict, list, bool)) else str(a) for a in arguments)])
            result = subprocess.run(command, capture_output=True, text=True, check=True, timeout=40)
            try:
                return json.loads(result.stdout)
            except json.JSONDecodeError:
                return result.stdout.strip()
        with (directory / "node-output.log").open("w") as log:
            node = subprocess.Popen(["bitcoind", *base, "-server=1", "-listen=0", "-discover=0", "-dnsseed=0", "-connect=0", "-rpcbind=127.0.0.1", "-rpcallowip=127.0.0.1", "-fallbackfee=0.0002", "-printtoconsole=0"], stdout=log, stderr=log)
            driver = None
            try:
                assert rpc("getblockchaininfo")["chain"] == "regtest"
                rpc("createwallet", "faucet")
                mining = rpc("getnewaddress", wallet="faucet")
                rpc("generatetoaddress", 101, mining)
                executable = Path(os.environ.get("CARGO_TARGET_DIR", str(ROOT / "target"))) / "debug/examples/regtest"
                driver = subprocess.Popen([str(executable), str(directory / "public-wallet-state.json")], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
                ready = read_event(driver)
                assert ready["phase"] == "ready"
                rpc("sendtoaddress", ready["address"], "1.0", wallet="faucet")
                rpc("generatetoaddress", 1, mining)
                destination = rpc("getnewaddress", wallet="faucet")
                blocks = [rpc("getblock", rpc("getblockhash", height), 0) for height in range(1, 103)]
                send_event(driver, {"blocks": blocks, "destination": destination})
                signed = read_event(driver)
                assert signed["phase"] == "signed"
                acceptance = rpc("testmempoolaccept", [signed["transaction"]])[0]
                assert acceptance["allowed"], acceptance
                assert rpc("sendrawtransaction", signed["transaction"]) == signed["txid"]
                confirmed = rpc("generatetoaddress", 1, mining)[0]
                send_event(driver, {"block": rpc("getblock", confirmed, 0), "height": 103})
                complete = read_event(driver)
                assert complete["phase"] == "complete"
                assert complete["confirmed_balance_sat"] == 75_000_000 - signed["fee_sat"]
                assert rpc("getreceivedbyaddress", destination, 1, wallet="faucet") == 0.25
                driver.wait(timeout=10)
                assert driver.returncode == 0
                print(f"PASS: share recovery, eight address comparisons, receive 1 BTC on regtest, disk reload, signed spend 0.25 BTC, confirmation, and reload. Fee: {signed['fee_sat']} sat.")
            finally:
                if driver and driver.poll() is None:
                    driver.terminate()
                    try:
                        driver.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        driver.kill()
                        driver.wait()
                if node.poll() is None:
                    node.terminate()
                    try:
                        node.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        node.kill()
                        node.wait()

if __name__ == "__main__":
    main()
