# Auto-Upload Module: Encrypted Footage → IPFS

Part of **Blockchain-Enabled Privacy-Preserving Smart Camera Footage using Hyperledger Fabric**
(UMaT, Dept. of Computer Science and Engineering).

This module covers **one stage** of the system pipeline described in Chapter 3 of the project report:

```
Camera capture → AES-256 Encryption → [THIS MODULE: Auto-upload to IPFS] → Hyperledger Fabric
```

It does **not** implement the camera capture, the PIR trigger, the encryption step, or the
Hyperledger Fabric client — those are separate components. This module only watches for
finished encrypted files and gets them onto IPFS automatically, logging the resulting CID
so the Fabric client can pick it up next.

---

## How it works

1. Your encryption process (already running on the Pi) writes a finished encrypted file
   (e.g. `clip_20260706_1042.enc`) into a watched folder.
2. This script detects the new file the instant it's created.
3. It waits until the file size stops changing (so a half-written file is never uploaded).
4. It uploads the file to your local IPFS node over the IPFS HTTP API.
5. IPFS returns a **CID** (Content Identifier) — a hash uniquely tied to that exact file.
6. The CID, filename, and timestamp are appended to `upload_log.jsonl`. This is the handoff
   point for the Hyperledger Fabric client, which reads this log and submits
   `{cid, camera_id, timestamp, wrapped_key}` as a ledger transaction.

---

## Prerequisites

- Raspberry Pi 5 with camera + encryption pipeline already working (as per your setup).
- IPFS (`kubo`) installed and running on the Pi.
- Python 3.9+.

---

## Setup

### 1. Install and start IPFS on the Pi

```bash
wget https://dist.ipfs.tech/kubo/v0.29.0/kubo_v0.29.0_linux-arm64.tar.gz
tar -xvzf kubo_v0.29.0_linux-arm64.tar.gz
cd kubo
sudo bash install.sh

ipfs init
ipfs daemon
```

Leave the daemon running (or set it up as its own systemd service — search "ipfs daemon
systemd" for a standard unit file). Confirm it's alive:

```bash
curl -X POST http://127.0.0.1:5001/api/v0/version
```

### 2. Get this module onto the Pi

```bash
git clone <your-repo-url> ipfs-uploader
cd ipfs-uploader
pip install -r requirements.txt
```

### 3. Configure the folder paths

Open `watch_and_upload.py` and confirm (or override via environment variables):

| Variable            | Meaning                                            | Default                                |
|---------------------|-----------------------------------------------------|-----------------------------------------|
| `ENCRYPTED_DIR`      | Folder where your encryption step saves files       | `/home/pi/camera/encrypted`             |
| `IPFS_API_URL`       | Local IPFS HTTP API endpoint                        | `http://127.0.0.1:5001/api/v0/add`      |
| `UPLOAD_LOG`         | Where CID records are logged for the Fabric client   | `/home/pi/camera/upload_log.jsonl`      |
| `DELETE_AFTER_UPLOAD`| Delete local file once IPFS upload succeeds          | `false`                                 |

### 4. Test it manually first

```bash
python3 watch_and_upload.py
```

In another terminal, drop a test file into the watched folder:

```bash
cp test_clip.enc /home/pi/camera/encrypted/
```

You should see console output like:

```
New encrypted file detected: /home/pi/camera/encrypted/test_clip.enc
File stable, uploading to IPFS: ...
Upload successful. CID: QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco
Logged for Fabric submission: {'cid': 'Qm...', 'filename': 'test_clip.enc', 'timestamp': ...}
```

And a new line in `upload_log.jsonl`.

### 5. Run it automatically on boot

```bash
sudo cp ipfs-uploader.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable ipfs-uploader
sudo systemctl start ipfs-uploader
```

Check status / logs:

```bash
sudo systemctl status ipfs-uploader
journalctl -u ipfs-uploader -f
```

From here on, every time your encryption step finishes writing a file into
`ENCRYPTED_DIR`, it is uploaded to IPFS automatically — no manual step required.

---

## What's intentionally *not* in this module

- **Hyperledger Fabric submission** — the CID log (`upload_log.jsonl`) is the contract
  between this module and your Fabric Gateway SDK client (Node.js). Wiring that up is a
  separate script that reads new lines from this log and invokes chaincode.
- **Encryption / key wrapping** — this module assumes the file arriving in `ENCRYPTED_DIR`
  is already AES-256 encrypted with the key already wrapped, per Section 3.5 of the report.
- **IPFS pinning strategy across remote peers** — this uploads to your local node; pinning
  services / remote peer replication (Section 3.6) are a network-level IPFS configuration,
  not part of this script.

---

## Repo structure

```
ipfs-uploader/
├── watch_and_upload.py     # main auto-upload script
├── requirements.txt        # pip dependencies
├── ipfs-uploader.service   # systemd unit for auto-start on boot
└── README.md               # this file
```
