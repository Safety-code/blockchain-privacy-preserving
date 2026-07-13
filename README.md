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
