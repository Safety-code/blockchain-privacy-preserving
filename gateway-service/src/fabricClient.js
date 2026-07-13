// fabricClient.js
// Wraps the official @hyperledger/fabric-gateway SDK. This is the ONLY
// module in this service that holds a Fabric identity / signs
// transactions -- everything else deals in plain JS objects.
//
// One gateway instance = one org's identity = one channel by default
// (see config.js). Org1's gateway process cannot act as Org2 -- there is
// no cross-org identity switching here, matching the "each org's keys
// stay with that org" principle from the architecture design.

import { connect, signers } from '@hyperledger/fabric-gateway';
import * as grpc from '@grpc/grpc-js';
import { readFile } from 'node:fs/promises';
import * as crypto from 'node:crypto';
import { config } from './config.js';

let gateway = null;
let contract = null;

async function newGrpcConnection() {
    const tlsRootCert = await readFile(config.tlsCertPath);
    const credentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(config.peerEndpoint, credentials, {
        'grpc.ssl_target_name_override': config.peerHostAlias,
    });
}

async function newIdentity() {
    const credentials = await readFile(config.identityCertPath);
    return { mspId: config.mspId, credentials };
}

async function newSigner() {
    const privateKeyPem = await readFile(config.identityKeyPath);
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    return signers.newPrivateKeySigner(privateKey);
}

export async function connectFabric() {
    const client = await newGrpcConnection();

    gateway = connect({
        client,
        identity: await newIdentity(),
        signer: await newSigner(),
        // Generous timeouts -- endorsement across orgs on a WSL2 test
        // network can be slower than production infrastructure.
        evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
        endorseOptions: () => ({ deadline: Date.now() + 15000 }),
        submitOptions: () => ({ deadline: Date.now() + 5000 }),
        commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
    });

    const network = gateway.getNetwork(config.channelName);
    contract = network.getContract(config.chaincodeName);

    console.log(`[fabricClient] connected as ${config.mspId} to channel "${config.channelName}", chaincode "${config.chaincodeName}"`);
}

export function closeFabric() {
    gateway?.close();
}

// --- Chaincode calls, one function per chaincode function ------------------

export async function createAsset(asset) {
    const resultBytes = await contract.submitTransaction(
        'CreateAsset',
        asset.videoId,
        asset.cameraId ?? '',
        asset.submittingOrg ?? config.mspId,
        asset.captureStartUtc ?? '',
        asset.captureEndUtc ?? '',
        asset.sha256Plaintext ?? '',
        asset.sha256Ciphertext,
        asset.cid,
        asset.wrappedKeyB64 ?? '',
        asset.ephemeralPubkeyPem ?? '',
        asset.algorithm?.bulkCipher ?? '',
        asset.algorithm?.keyWrap ?? ''
    );
    return resultBytes;
}

export async function transferCustody(videoId, newWrappedKeyB64, newEphemeralPubkeyPem, fromOrg, toOrg) {
    return contract.submitTransaction(
        'TransferCustody',
        videoId,
        newWrappedKeyB64,
        newEphemeralPubkeyPem,
        fromOrg,
        toOrg
    );
}

export async function readAsset(videoId) {
    const resultBytes = await contract.evaluateTransaction('ReadAsset', videoId);
    return JSON.parse(Buffer.from(resultBytes).toString('utf8'));
}

export async function getAssetHistory(videoId) {
    const resultBytes = await contract.evaluateTransaction('GetAssetHistory', videoId);
    return JSON.parse(Buffer.from(resultBytes).toString('utf8'));
}
