#!/usr/bin/env python3
"""
watch_and_upload.py

Watches a folder for newly-created ENCRYPTED video files (produced after the
Pi's AES-256 encryption step) and automatically uploads each one to a local
IPFS node via the HTTP API as soon as the file is fully written.

Scope (matches project report, Section 3.5.1 / 3.6):
    Camera capture -> Encryption  (already done upstream, not this script)
    This script    -> Watch encrypted-file folder -> Upload to IPFS -> Get CID
    Next stage      -> Send CID + wrapped key + metadata to Hyperledger Fabric
                       (handled by a separate Fabric Gateway SDK client -
                        a stub hook is provided below so you can wire it in
                        without changing this file's core logic).

Requirements:
    pip install watchdog requests

Run:
    python3 watch_and_upload.py
"""

import os
import sys
import time
import json
import logging
import requests
from typing import Optional

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# ----------------------------- CONFIGURATION ------------------------------

# Folder where the encryption step writes finished encrypted video files.
WATCH_DIR = os.environ.get("ENCRYPTED_DIR", "/home/pi/camera/encrypted")

# Only react to files with these extensions (adjust to match your encryption
# output naming, e.g. video.h264.enc)
WATCHED_EXTENSIONS = (".enc",)

# Local IPFS HTTP API endpoint (default when `ipfs daemon` is running on the Pi)
IPFS_API_URL = os.environ.get("IPFS_API_URL", "http://127.0.0.1:5001/api/v0/add")

# Where successful uploads (CID + metadata) are logged.
# This file is what your Hyperledger Fabric client script should read from
# to submit the "record CID on ledger" transaction.
UPLOAD_LOG = os.environ.get("UPLOAD_LOG", "/home/pi/camera/upload_log.jsonl")

# How long (seconds) a file's size must stay unchanged before we consider it
# "fully written" and safe to upload. Prevents uploading a half-written file.
STABLE_CHECK_INTERVAL = 2
STABLE_CHECK_ROUNDS = 3

# If True, deletes the local encrypted copy once the IPFS upload succeeds.
# Matches report design (Pi does not retain state) - but only enable this
# once your Fabric confirmation step is also wired in, so you don't delete
# a file before it's actually anchored on-chain.
DELETE_AFTER_UPLOAD = os.environ.get("DELETE_AFTER_UPLOAD", "false").lower() == "true"

# ----------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("ipfs-uploader")


def wait_until_stable(filepath: str) -> bool:
    """Poll file size until it stops changing, indicating the write is done."""
    previous_size = -1
    stable_rounds = 0
    while stable_rounds < STABLE_CHECK_ROUNDS:
        if not os.path.exists(filepath):
            return False
        try:
            current_size = os.path.getsize(filepath)
        except OSError:
            return False
        if current_size == previous_size and current_size > 0:
            stable_rounds += 1
        else:
            stable_rounds = 0
        previous_size = current_size
        time.sleep(STABLE_CHECK_INTERVAL)
    return True


def upload_to_ipfs(filepath: str) -> Optional[str]:
    """POST a file to the local IPFS node and return its CID, or None on failure."""
    filename = os.path.basename(filepath)
    try:
        with open(filepath, "rb") as f:
            files = {"file": (filename, f)}
            response = requests.post(IPFS_API_URL, files=files, timeout=120)
        response.raise_for_status()
        result = response.json()
        cid = result.get("Hash")
        if not cid:
            log.error("IPFS response missing CID for %s: %s", filename, result)
            return None
        return cid
    except requests.RequestException as e:
        log.error("IPFS upload failed for %s: %s", filename, e)
        return None


def notify_blockchain_stub(cid: str, filename: str, timestamp: float):
    """
    Hook for the next stage of the pipeline (out of this script's scope):
    submitting {cid, camera_id, timestamp, wrapped_key} to Hyperledger Fabric
    via the Fabric Gateway SDK (Node.js) as described in Section 3.5.2.

    For now this just appends a structured record to UPLOAD_LOG so a separate
    Fabric client process can pick it up and submit the transaction.
    """
    record = {
        "cid": cid,
        "filename": filename,
        "timestamp": timestamp,
    }
    with open(UPLOAD_LOG, "a") as log_file:
        log_file.write(json.dumps(record) + "\n")
    log.info("Logged for Fabric submission: %s", record)


class EncryptedFileHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return
        filepath = event.src_path
        if not filepath.endswith(WATCHED_EXTENSIONS):
            return

        log.info("New encrypted file detected: %s", filepath)

        if not wait_until_stable(filepath):
            log.warning("File disappeared or never stabilized: %s", filepath)
            return

        log.info("File stable, uploading to IPFS: %s", filepath)
        cid = upload_to_ipfs(filepath)

        if cid:
            log.info("Upload successful. CID: %s", cid)
            notify_blockchain_stub(cid, os.path.basename(filepath), time.time())

            if DELETE_AFTER_UPLOAD:
                try:
                    os.remove(filepath)
                    log.info("Local copy deleted (pinned to IPFS): %s", filepath)
                except OSError as e:
                    log.error("Could not delete local file %s: %s", filepath, e)
        else:
            log.error("Upload failed, local file retained: %s", filepath)


def main():
    if not os.path.isdir(WATCH_DIR):
        log.error("Watch directory does not exist: %s", WATCH_DIR)
        sys.exit(1)

    # Confirm the IPFS daemon is reachable before starting
    try:
        version_url = IPFS_API_URL.replace("/add", "/version")
        requests.post(version_url, timeout=5).raise_for_status()
    except requests.RequestException:
        log.error(
            "Cannot reach IPFS daemon at %s. Is `ipfs daemon` running?",
            IPFS_API_URL,
        )
        sys.exit(1)

    log.info("Watching %s for new encrypted files...", WATCH_DIR)
    event_handler = EncryptedFileHandler()
    observer = Observer()
    observer.schedule(event_handler, WATCH_DIR, recursive=False)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        log.info("Stopped by user.")
    observer.join()


if __name__ == "__main__":
    main()
