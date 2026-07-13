// config.js
// All paths here are relative to WHATEVER org this gateway instance is
// running on behalf of. In this design, each org runs its OWN gateway
// instance -- Org1's gateway holds Org1's Fabric identity and its own
// IPFS node address, and never touches Org2/Org3's private keys. This
// mirrors the "keys never leave the org" principle from the architecture
// discussion; there is no single shared gateway with access to everyone's
// wallet material.

import 'dotenv/config';

function required(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export const config = {
    // --- Which org this gateway instance represents ---
    mspId: process.env.MSP_ID || 'Org1MSP',
    orgLabel: process.env.ORG_LABEL || 'Org1 - Police',

    // --- Fabric Gateway connection (peer this instance talks to) ---
    peerEndpoint: process.env.PEER_ENDPOINT || 'localhost:7051',
    peerHostAlias: process.env.PEER_HOST_ALIAS || 'peer0.org1.example.com',
    tlsCertPath: required('TLS_CERT_PATH'),          // peer TLS CA cert (.crt)
    identityCertPath: required('IDENTITY_CERT_PATH'), // this org's signing identity cert
    identityKeyPath: required('IDENTITY_KEY_PATH'),   // matching private key

    // --- Channel / chaincode this gateway writes to by default ---
    // An Org1 gateway typically only needs channel1-2 (its custody
    // relationship with the Lab); Org2 would run a second gateway config
    // for channel2-3 if it also submits Judiciary-bound transactions.
    channelName: process.env.CHANNEL_NAME || 'channel1-2',
    chaincodeName: process.env.CHAINCODE_NAME || 'evidence',

    // --- IPFS (this org's own Kubo node, per the private-cluster design) ---
    ipfsApiUrl: process.env.IPFS_API_URL || 'http://127.0.0.1:5001',
    ipfsPollIntervalMs: Number(process.env.IPFS_POLL_INTERVAL_MS || 5000),

    // --- HTTP / WebSocket server for the frontend dashboard ---
    httpPort: Number(process.env.HTTP_PORT || 4000),

    // --- Local state file (persists which CIDs have already been seen,
    // so a restart doesn't re-draft everything that's already committed) ---
    stateFilePath: process.env.STATE_FILE_PATH || './data/gateway-state.json',

    // --- Camera/device identity fallback for manually-uploaded files
    // (e.g. the IPFS Desktop test uploads) that arrive with no metadata
    // from a Pi pipeline ---
    manualUploadCameraId: 'MANUAL-UPLOAD',
};
