import requests
import hashlib
import os

def calculate_sha256(file_path):
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        # Read in chunks to handle large video files efficiently
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def upload_to_ipfs(file_path):
    # 1. Calculate forensic hash
    local_hash = calculate_sha256(file_path)
    print(f"Forensic SHA-256: {local_hash}")

    # 2. Upload to IPFS
    url = 'http://127.0.0.1:5001/api/v0/add'
    with open(file_path, 'rb') as f:
        files = {'file': f}
        response = requests.post(url, files=files)

    if response.status_code == 200:
        cid = response.json()['Hash']
        print(f"Upload Successful! CID: {cid}")
        return cid, local_hash
    else:
        print("Upload Failed.")
        return None, None

# Usage
cid, f_hash = upload_to_ipfs('test_video.mp4')