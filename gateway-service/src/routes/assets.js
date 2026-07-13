// routes/assets.js
//
// Two distinct ingestion paths land here, and it matters which one a
// given draft came from:
//
//   1. POST /api/ingest  -- called by evidence_capture_pipeline.py's
//      submit_to_fabric(). This is the PRIMARY path: the Pi already did
//      real AES-256-GCM encryption and ECIES key-wrapping, so the draft
//      arrives complete. Confirmation here is a pure accountability
//      checkpoint -- a human affirms "yes, log this" -- not a data-entry
//      step.
//
//   2. The ipfsWatcher's automatic CID polling -- a FALLBACK path for
//      content that shows up in IPFS without ever going through the
//      pipeline (e.g. a manual test upload via IPFS Desktop). These
//      drafts arrive with wrappedKeyB64/ephemeralPubkeyPem missing,
//      because the gateway has no way to fabricate real key-wrap
//      material for content it didn't participate in encrypting. The
//      frontend must visibly distinguish these ("Unencrypted / Test
//      Upload" warning) rather than let them look like real evidence
//      records -- do not paper over this gap in the UI.

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { addDraft, getDraft, listDrafts, removeDraft } from '../draftStore.js';
import * as fabric from '../fabricClient.js';
import { bus, EVENTS } from '../events.js';
import { config } from '../config.js';

export const router = Router();

// --- Primary ingestion path: called by the Pi pipeline's gateway POST ---
router.post('/ingest', async (req, res) => {
    const body = req.body;

    const requiredFields = ['cid', 'sha256_ciphertext', 'wrapped_key_b64', 'ephemeral_pubkey_pem'];
    const missing = requiredFields.filter((f) => !body[f]);
    if (missing.length > 0) {
        return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    const draft = {
        videoId: body.video_id || uuidv4(),
        cid: body.cid,
        sha256Ciphertext: body.sha256_ciphertext,
        sha256Plaintext: body.sha256_plaintext ?? null,
        cameraId: body.camera_id ?? 'UNKNOWN',
        submittingOrg: body.submitting_org ?? config.mspId,
        captureStartUtc: body.capture_start_utc ?? null,
        captureEndUtc: body.capture_end_utc ?? null,
        detectedAt: new Date().toISOString(),
        wrappedKeyB64: body.wrapped_key_b64,
        ephemeralPubkeyPem: body.ephemeral_pubkey_pem,
        algorithm: body.algorithm ?? { bulkCipher: 'AES-256-GCM', keyWrap: 'ECIES-P256-HKDF-SHA256-AESGCM' },
        status: 'draft',
        needsReview: true,
        source: 'pipeline', // distinguishes from watcher-detected drafts
    };

    await addDraft(draft);
    bus.emit(EVENTS.DRAFT_NEW, draft);

    res.status(201).json({ videoId: draft.videoId, status: 'draft' });
});

// --- List pending drafts (frontend Dashboard §4.2) ---
router.get('/pending', (req, res) => {
    res.json(listDrafts());
});

// --- Confirm a draft -> submits CreateAsset to the ledger (§4.3) ---
router.post('/pending/:videoId/confirm', async (req, res) => {
    const draft = getDraft(req.params.videoId);
    if (!draft) {
        return res.status(404).json({ error: 'Draft not found (already confirmed, or never existed)' });
    }

    if (draft.source !== 'pipeline') {
        // Fallback-path drafts have no real key-wrap material -- refuse to
        // silently commit them as if they were fully encrypted evidence.
        // A real deployment might allow this ONLY behind an explicit
        // "test/demo record" flag; left as a hard stop here on purpose.
        return res.status(422).json({
            error: 'This draft has no verified key-wrap material (not from the capture pipeline). ' +
                   'Confirming it would record an incomplete evidence entry. Resolve manually before proceeding.',
        });
    }

    try {
        await fabric.createAsset(draft);
        await removeDraft(draft.videoId);
        bus.emit(EVENTS.ASSET_COMMITTED, draft);
        res.json({ videoId: draft.videoId, status: 'committed' });
    } catch (err) {
        console.error('[routes/assets] CreateAsset failed:', err);
        res.status(502).json({ error: 'Ledger submission failed', detail: err.message });
    }
});

// --- Read a committed asset (§4.4) ---
router.get('/assets/:videoId', async (req, res) => {
    try {
        const asset = await fabric.readAsset(req.params.videoId);
        res.json(asset);
    } catch (err) {
        res.status(404).json({ error: 'Asset not found on ledger', detail: err.message });
    }
});

// --- Custody transfer (§4.5) ---
router.post('/assets/:videoId/transfer', async (req, res) => {
    const { newWrappedKeyB64, newEphemeralPubkeyPem, fromOrg, toOrg } = req.body;
    if (!newWrappedKeyB64 || !newEphemeralPubkeyPem || !fromOrg || !toOrg) {
        return res.status(400).json({ error: 'newWrappedKeyB64, newEphemeralPubkeyPem, fromOrg, toOrg are all required' });
    }

    try {
        await fabric.transferCustody(req.params.videoId, newWrappedKeyB64, newEphemeralPubkeyPem, fromOrg, toOrg);
        bus.emit(EVENTS.ASSET_TRANSFERRED, { videoId: req.params.videoId, toOrg });
        res.json({ videoId: req.params.videoId, status: 'transferred', toOrg });
    } catch (err) {
        console.error('[routes/assets] TransferCustody failed:', err);
        res.status(502).json({ error: 'Ledger submission failed', detail: err.message });
    }
});

// --- Audit history (§4.6) ---
router.get('/assets/:videoId/history', async (req, res) => {
    try {
        const history = await fabric.getAssetHistory(req.params.videoId);
        res.json(history);
    } catch (err) {
        res.status(404).json({ error: 'History not available', detail: err.message });
    }
});
