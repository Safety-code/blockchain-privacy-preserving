// ipfsWatcher.js
// Polls this org's own Kubo node (part of the private/permissioned IPFS
// cluster from the architecture design) for pins that haven't been seen
// before, and drafts a pending asset record for each.
//
// Why polling `pin ls` rather than something fancier: pins are the
// deliberate "this content matters, keep it" signal in your IPFS setup
// (per the Pi pipeline's client.pin.add() call, and manual IPFS Desktop
// uploads default to pinning too). Polling is simple, robust across
// Kubo versions, and easy to reason about for a thesis-scale deployment.
// A production system at larger scale might move to IPFS pubsub instead,
// but polling every few seconds is more than fast enough here.
//
// For content that arrives with NO prior metadata (e.g. a file dragged
// into IPFS Desktop manually, as in the earlier manual test) this
// watcher still produces a usable draft -- it fetches the content,
// computes its own SHA-256 independently of the CID (matching the
// "don't rely on the CID alone" integrity design), and fills in
// placeholder fields the confirming user completes in the frontend.

import { create as createKuboClient } from 'kubo-rpc-client';
import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import { hasSeenCid, addDraft } from './draftStore.js';
import { bus, EVENTS } from './events.js';

const ipfs = createKuboClient({ url: config.ipfsApiUrl });

async function hashPinnedContent(cid) {
    const hash = createHash('sha256');
    for await (const chunk of ipfs.cat(cid)) {
        hash.update(chunk);
    }
    return hash.digest('hex');
}

async function getPinnedCids() {
    const cids = [];
    for await (const { cid } of ipfs.pin.ls({ type: 'recursive' })) {
        cids.push(cid.toString());
    }
    return cids;
}

async function draftFromCid(cid) {
    // Independently computed hash -- this is the value that gets compared
    // against the ledger record later in the "Verify Now" frontend action.
    const sha256Ciphertext = await hashPinnedContent(cid);

    const draft = {
        videoId: uuidv4(),
        cid,
        sha256Ciphertext,
        sha256Plaintext: null, // unknown unless the uploader (Pi pipeline) supplied it
        cameraId: config.manualUploadCameraId,
        submittingOrg: config.mspId,
        captureStartUtc: null,
        captureEndUtc: null,
        detectedAt: new Date().toISOString(),
        wrappedKeyB64: null,      // must be filled before confirmation -- see note below
        ephemeralPubkeyPem: null,
        algorithm: { bulkCipher: 'AES-256-GCM', keyWrap: 'ECIES-P256-HKDF-SHA256-AESGCM' },
        status: 'draft',
        needsReview: true,
    };

    return draft;
}

let pollHandle = null;

export function startWatching() {
    if (pollHandle) return; // already running

    pollHandle = setInterval(async () => {
        try {
            const pinnedCids = await getPinnedCids();
            for (const cid of pinnedCids) {
                if (hasSeenCid(cid)) continue;

                const draft = await draftFromCid(cid);
                await addDraft(draft);
                bus.emit(EVENTS.DRAFT_NEW, draft);
                console.log(`[ipfsWatcher] New CID detected and drafted: ${cid} -> ${draft.videoId}`);
            }
        } catch (err) {
            // Don't crash the watcher loop on a transient IPFS API hiccup --
            // log and retry on the next tick. Matches the "gateway service
            // unreachable" degrade-gracefully state from the frontend design.
            console.error('[ipfsWatcher] poll failed:', err.message);
        }
    }, config.ipfsPollIntervalMs);

    console.log(`[ipfsWatcher] watching ${config.ipfsApiUrl} every ${config.ipfsPollIntervalMs}ms`);
}

export function stopWatching() {
    if (pollHandle) {
        clearInterval(pollHandle);
        pollHandle = null;
    }
}
