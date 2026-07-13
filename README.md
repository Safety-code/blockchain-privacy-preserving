# IPFS Forensic Storage Module

This module provides a secure, forensically-sound pipeline for uploading surveillance video to IPFS.

## Setup

1. Install [Kubo CLI](https://dist.ipfs.tech/#kubo).
2. Run ipfs init and ipfs daemon.
3. Run pip install -r requirements.txt.

# Setting Up IPFS — Step-by-Step Guide

This guide covers installing and configuring **IPFS**, with **Windows** and **Raspberry Pi** as the primary targets. macOS/general Linux steps are included for completeness. Two paths are covered:

- **Kubo** — the command-line IPFS daemon (best for Raspberry Pi / headless nodes, servers, and programmatic use)
- **IPFS Desktop** — a GUI app that bundles Kubo with a visual dashboard (best for Windows/day-to-day use)

You can install either or both — IPFS Desktop actually runs a Kubo node under the hood.

---

## 1. Choose Your Setup

| Platform         | Recommended                   | Why                                                    |
| ---------------- | ----------------------------- | ------------------------------------------------------ |
| **Windows**      | IPFS Desktop (+ optional CLI) | GUI dashboard, easy file management, tray icon control |
| **Raspberry Pi** | Kubo (CLI only)               | Headless, low resource use, runs as a systemd service  |
| macOS            | IPFS Desktop or Kubo          | Either works well                                      |
| Linux (desktop)  | IPFS Desktop or Kubo          | Either works well                                      |

---

## 2. Windows Setup

### Option A — IPFS Desktop (recommended for Windows)

1. Go to [github.com/ipfs/ipfs-desktop/releases](https://github.com/ipfs/ipfs-desktop/releases).
2. Download the latest `ipfs-desktop-setup-x.x.x.exe`.
3. Run the installer and follow the prompts.
4. Launch **IPFS Desktop** from the Start menu. On first launch it initializes a Kubo node automatically and starts the daemon.
5. You'll see a system tray icon — this indicates the node status. Click it to open the dashboard, view Files, Peers, and Settings.
6. The dashboard runs at `http://127.0.0.1:5001/webui` in your browser if you want to view it separately.

That's it — no manual `ipfs init` or `ipfs daemon` needed; the app manages this for you.

### Option B — Kubo CLI on Windows

1. Download the Windows release from [dist.ipfs.tech/#kubo](https://dist.ipfs.tech/#kubo) (choose `windows-amd64`).
2. Extract the `.zip` file — you'll get an `ipfs.exe`.
3. Move the folder somewhere permanent, e.g. `C:\ipfs`, and add it to your `PATH`:
   - Open **System Properties → Environment Variables**
   - Edit the `Path` variable and add `C:\ipfs`
4. Open a new PowerShell/Command Prompt and verify:
   ```powershell
   ipfs --version
   ```
5. Initialize and run (see [Section 4](#4-initialize-and-run-kubo-cli) below).

---

## 3. Raspberry Pi Setup (Kubo CLI)

Raspberry Pi should run **headless Kubo** as a background service — no desktop GUI needed.

1. Check your Pi's architecture (most modern Pis are `arm64`; older ones are `arm`):
   ```bash
   uname -m
   ```
2. Download the matching Kubo release:

   ```bash
   # For 64-bit Pi OS (arm64)
   wget https://dist.ipfs.tech/kubo/v0.28.0/kubo_v0.28.0_linux-arm64.tar.gz

   # For 32-bit Pi OS (arm)
   wget https://dist.ipfs.tech/kubo/v0.28.0/kubo_v0.28.0_linux-arm.tar.gz
   ```

3. Extract and install:
   ```bash
   tar -xvzf kubo_v0.28.0_linux-arm64.tar.gz
   cd kubo
   sudo bash install.sh
   ```
4. Verify:
   ```bash
   ipfs --version
   ```
5. Initialize with a **low-power profile** — important on a Pi to reduce CPU/RAM/disk load:
   ```bash
   ipfs init --profile=lowpower
   ```
6. Set it up to run automatically on boot as a **systemd service** (see [Section 6](#6-run-as-a-background-service-raspberry-pi--linux)) — this is the standard way to run IPFS on a Pi, since you won't want to keep a terminal open.

---

## 4. Initialize and Run (Kubo CLI)

These steps apply to Windows CLI, Raspberry Pi, macOS, and Linux Kubo installs alike.

```bash
# Initialize the repo (creates ~/.ipfs with your keypair and config)
ipfs init

# Start the daemon
ipfs daemon
```

You'll see your node's **Peer ID** — this uniquely identifies your node. Leave the daemon running, or set it up as a service (Windows Task Scheduler or Raspberry Pi systemd — see Section 6).

By default this exposes:

- **API** — `127.0.0.1:5001`
- **Gateway** — `127.0.0.1:8080`
- **Swarm** — `0.0.0.0:4001`

---

## 5. Test Your Node

In a second terminal (or PowerShell window):

```bash
# Add a file
echo "Hello IPFS" > test.txt
ipfs add test.txt
# Returns a CID (Content Identifier), e.g. QmXk...9fA

# Retrieve it
ipfs cat QmXk...9fA

# Or view via the local gateway in a browser:
# http://127.0.0.1:8080/ipfs/QmXk...9fA
```

Check connected peers:

```bash
ipfs swarm peers
```

If you're using IPFS Desktop, the same actions can be done via the **Files** tab in the dashboard — drag and drop files to add them.

---

## 6. Run as a Background Service (Raspberry Pi / Linux)

Create `/etc/systemd/system/ipfs.service`:

```ini
[Unit]
Description=IPFS Daemon
After=network.target

[Service]
User=<your-username>
Environment=IPFS_PATH=/home/<your-username>/.ipfs
ExecStart=/usr/local/bin/ipfs daemon
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable ipfs
sudo systemctl start ipfs
sudo systemctl status ipfs
```

### Windows equivalent (Kubo CLI, no IPFS Desktop)

If you installed the CLI (not IPFS Desktop) and want it to run automatically:

1. Open **Task Scheduler** → Create Task
2. Trigger: **At log on**
3. Action: **Start a program** → point to `ipfs.exe daemon`
4. Set "Run whether user is logged on or not" if you want it fully background

(If you installed IPFS Desktop instead, this is unnecessary — it already runs the daemon automatically and adds itself to startup.)

## Quick Reference

| Task                           | Command                        |
| ------------------------------ | ------------------------------ |
| Initialize node                | `ipfs init`                    |
| Initialize (low-power, for Pi) | `ipfs init --profile=lowpower` |
| Start daemon                   | `ipfs daemon`                  |
| Add file                       | `ipfs add <file>`              |
| Retrieve file                  | `ipfs cat <CID>`               |
| Pin content                    | `ipfs pin add <CID>`           |
| List peers                     | `ipfs swarm peers`             |
| Check node ID                  | `ipfs id`                      |


---------------------------------------------------------------------------------------------------------------------------
# HLF Network Setup — Full Guide (3-Org, 3-Channel Evidence Network)

This documents the complete, working setup sequence for the blockchain
evidence network, from a clean machine to a deployed chaincode ready for
the gateway service. It reflects the actual working order established
through hands-on debugging — not the stock `fabric-samples` tutorial flow,
since this project uses a custom 3-org, pairwise-channel topology that the
default scripts (`network.sh`, `addOrg3.sh`) don't support.

**Do not run `./network.sh up` on this project.** It bootstraps its own
crypto material and default topology, which conflicts with the custom
per-org `cryptogen` configs and 3-channel design documented here.

---

## 0. Prerequisites

- WSL2 (Ubuntu) on Windows, with Docker Desktop installed and **WSL
  Integration enabled** for your distro (Docker Desktop → Settings →
  Resources → WSL Integration)
- Go (for chaincode)
- Node.js 18+ (for the gateway service)
- Fabric binaries + samples cloned to `~/blockchain-privacy-preserving/fabric-samples/`

Install Fabric binaries if not already present:
```bash
cd ~/blockchain-privacy-preserving/fabric-samples
curl -sSL https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh | bash -s -- binary
```

Add the binaries to your shell permanently (do this once):
```bash
echo 'export PATH=$HOME/blockchain-privacy-preserving/fabric-samples/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
which peer cryptogen configtxgen osnadmin   # all four should resolve
```

**Do not** set `FABRIC_CFG_PATH` permanently in `.bashrc` — it needs to
point at different directories depending on the tool (see §5 below). Set
it explicitly per command/session instead.

---

## 1. Project structure

See `PROJECT_STRUCTURE.md` for the full layout. The short version:
`fabric-samples/` is the cloned reference repo (only `test-network/` gets
our extra scripts dropped into it); `chaincode/`, `gateway-service/`, and
`edge-device/` are our own code, kept as siblings to `fabric-samples/` so
a future `git pull` inside it never threatens custom work.

---

## 2. Define the org topology

Three orgs, three pairwise channels — no single channel shared by all
three (see the architecture discussion on why: it structurally enforces
the chain-of-custody model rather than relying on application logic):

| Org | Role | Peer port | MSP ID |
|---|---|---|---|
| Org1 | Police (evidence capture) | 7051 | Org1MSP |
| Org2 | Forensic Lab | 9051 | Org2MSP |
| Org3 | Judiciary | 11051 | Org3MSP |

| Channel | Members |
|---|---|
| channel1-2 | Org1 + Org2 |
| channel1-3 | Org1 + Org3 |
| channel2-3 | Org2 + Org3 |

This requires:
- `organizations/cryptogen/crypto-config-orderer.yaml`, `-org1.yaml`,
  `-org2.yaml`, `-org3.yaml` — one per org plus the orderer
- `configtx/configtx.yaml` with **three separate profiles**
  (`Channel1v2`, `Channel1v3`, `Channel2v3`), each listing only its two
  member orgs under `Application.Organizations` — not one shared profile
  with all three orgs
- `docker-compose-orderer.yaml`, `-org1.yaml`, `-org2.yaml`,
  `-org3.yaml` — one compose file per component

If any of these don't exist yet in your `test-network/`, create them
before proceeding — everything below assumes they're in place.

---

## 3. Generate crypto material

Use the bootstrap script (wipes and regenerates everything in one
deterministic, verified pass — this replaces manually running `cryptogen`
per org, which is where several of our earlier sessions went wrong via
partial/stale generations):

```bash
cd ~/blockchain-privacy-preserving/fabric-samples/test-network
./bootstrap_crypto.sh
```

It prints `OK`/`MISSING` for every certificate file the network actually
needs. Do not proceed until every line shows `OK`.

---

## 4. Bring up the network containers

**Use your own compose files, not `network.sh up`:**

```bash
docker-compose -f docker-compose-orderer.yaml \
               -f docker-compose-org1.yaml \
               -f docker-compose-org2.yaml \
               -f docker-compose-org3.yaml \
               up -d
```

Confirm everything is running:
```bash
docker ps
```
You should see the orderer and 5 peer containers (however your peer
count is distributed across the 3 orgs) all in `Up` status.

If you ever regenerate crypto material (§3) after containers are already
running, they'll have stale certs baked into their running state —
always `down` then `up` again after a crypto regeneration:
```bash
docker-compose -f docker-compose-orderer.yaml -f docker-compose-org1.yaml \
               -f docker-compose-org2.yaml -f docker-compose-org3.yaml down
# re-run bootstrap_crypto.sh if needed, then:
docker-compose -f docker-compose-orderer.yaml -f docker-compose-org1.yaml \
               -f docker-compose-org2.yaml -f docker-compose-org3.yaml up -d
```

---

## 5. Create and join the three channels

```bash
cd ~/blockchain-privacy-preserving/fabric-samples/test-network
chmod +x create_channels.sh
./create_channels.sh
```

This script handles the two different `FABRIC_CFG_PATH` requirements
internally (this was a major source of earlier errors — worth
understanding even though the script now automates it):
- **`configtxgen`** needs `FABRIC_CFG_PATH` pointing at `test-network/configtx/` (where the custom `configtx.yaml` with your 3 profiles lives)
- **`peer`/`osnadmin`** need it pointing at `fabric-samples/config/` (the stock peer defaults)

It also uses the **channel-participation API** (`osnadmin channel join` +
`-outputBlock` genesis blocks), not the older
`peer channel create`/`-outputCreateChannelTx` flow — required because
this project's `configtx.yaml` profiles combine `Orderer:` and
`Application:` sections (no system channel).

Verify all three channels exist and both relevant orgs joined each:
```bash
for org in 1 2 3; do
  echo "--- Org${org} ---"
  # (set CORE_PEER_* vars for that org, then:)
  peer channel list
done
```

---

## 6. Write and deploy the chaincode

Chaincode source lives at `~/blockchain-privacy-preserving/chaincode/evidence-contract/`
(see `chaincode.go`) — a sibling to `fabric-samples`, not inside it.

```bash
cd ~/blockchain-privacy-preserving/chaincode/evidence-contract
go mod tidy
```

Deploy on **channel1-2 first** (prove the toolchain on the simplest case
before repeating for the other two channels):

```bash
cd ~/blockchain-privacy-preserving/fabric-samples/test-network

peer lifecycle chaincode package evidence.tar.gz \
  --path ../../chaincode/evidence-contract --lang golang --label evidence_1

# install on both Org1's and Org2's peer (switch CORE_PEER_* identity between calls)
peer lifecycle chaincode install evidence.tar.gz

# approve for each org (switch identity between calls)
peer lifecycle chaincode approveformyorg \
  --channelID channel1-2 --name evidence --version 1.0 \
  --package-id <PACKAGE_ID_FROM_INSTALL> --sequence 1 \
  --signature-policy "AND('Org1MSP.peer','Org2MSP.peer')" \
  --tls --cafile $ORDERER_CA

peer lifecycle chaincode checkcommitreadiness \
  --channelID channel1-2 --name evidence --version 1.0 --sequence 1

peer lifecycle chaincode commit \
  --channelID channel1-2 --name evidence --version 1.0 --sequence 1 \
  --peerAddresses localhost:7051 --tlsRootCertFiles <org1-peer-tls-ca> \
  --peerAddresses localhost:9051 --tlsRootCertFiles <org2-peer-tls-ca>
```

Repeat for `channel1-3` (Org1+Org3, `AND('Org1MSP.peer','Org3MSP.peer')`)
and `channel2-3` (Org2+Org3), reusing the same packaged chaincode.

---

## 7. Manual smoke test

Before wiring up anything automatic, prove the chaincode works with a
hand-typed invoke:

```bash
peer chaincode invoke \
  -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls \
  --cafile $ORDERER_CA \
  -C channel1-2 -n evidence \
  --peerAddresses localhost:7051 --tlsRootCertFiles <org1-tls-ca> \
  --peerAddresses localhost:9051 --tlsRootCertFiles <org2-tls-ca> \
  -c '{"function":"CreateAsset","Args":["video-001","CAM-01","Org1MSP","2026-01-01T00:00:00Z","2026-01-01T00:01:00Z","","<sha256>","<cid>","<wrappedkey>","<ephemeralpubkey>","AES-256-GCM","ECIES-P256"]}'

peer chaincode query -C channel1-2 -n evidence \
  -c '{"function":"ReadAsset","Args":["video-001"]}'
```
If the query returns the record you just wrote, the network + chaincode
are fully functional.

---

## 8. IPFS layer

- Run Kubo on the Pi; IPFS Desktop on Windows (or Kubo on each org's
  infrastructure for a real deployment)
- Connect nodes via `ipfs swarm connect` + persistent `Peering.Peers`
  config (see the architecture notes on this)
- For production, generate a shared `swarm.key` and disable public
  bootstrap nodes to keep this a private, org-restricted IPFS cluster

---

## 9. Gateway service

```bash
cd ~/blockchain-privacy-preserving/gateway-service
cp .env.example .env
# edit .env: MSP_ID, PEER_ENDPOINT, TLS_CERT_PATH, IDENTITY_CERT_PATH,
# IDENTITY_KEY_PATH, CHANNEL_NAME, IPFS_API_URL -- all specific to
# whichever org this gateway instance represents
npm install
npm start
```
One gateway instance per org. Confirm with:
```bash
curl http://localhost:4000/health
```

---

## 10. Edge device (Pi)

Deploy `edge-device/evidence_capture_pipeline.py` to the Pi per
`edge-device/README.md`'s provisioning steps, pointed at the gateway's
`/api/ingest` endpoint.

---

## Troubleshooting reference (issues actually hit during setup)

| Symptom | Cause | Fix |
|---|---|---|
| `peer: command not found` | Fabric `bin/` not on `PATH` | `export PATH=.../fabric-samples/bin:$PATH`, add to `.bashrc` |
| `configtxgen: command not found` | same as above | same fix, applies to all 4 binaries |
| `Cannot run peer because cannot init crypto` | `CORE_PEER_MSPCONFIGPATH` not set / wrong org identity not exported this session | Re-export the full `CORE_PEER_*` block for the org you intend to act as |
| `Could not find profile: X` | `FABRIC_CFG_PATH` pointing at the wrong `configtx.yaml` (multiple copies exist) | `export FABRIC_CFG_PATH=${PWD}/configtx` before any `configtxgen` call |
| `could not load a valid ca certificate ... no such file or directory` (org or orderer) | `cryptogen generate` never run for that component, or partially run | Use `bootstrap_crypto.sh`, which verifies every required file exists |
| `osnadmin ... connection refused 7053` | Orderer container not running / crashed on stale certs / port not published | `docker ps -a`, check logs, restart container after crypto regeneration |
| `docker: Input/output error` | Docker Desktop crashed or WSL2 integration disconnected | Restart Docker Desktop, confirm WSL Integration toggle, `wsl --shutdown` if needed |
| `npm error ENOENT ... package.json` | Files copied to wrong path, or copy step skipped | `find` for the real file location, re-copy with correct destination |

**General pattern behind most of these:** Fabric CLI tools rely entirely
on shell environment variables (`PATH`, `FABRIC_CFG_PATH`,
`CORE_PEER_*`) that do **not persist across new terminal sessions**. Any
time a fresh error looks like "can't find X" immediately after opening a
new terminal, re-check these first before assuming something is broken.

