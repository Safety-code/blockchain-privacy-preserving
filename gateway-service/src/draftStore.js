// draftStore.js
// Lightweight local persistence for:
//   - drafts: CIDs detected but not yet confirmed to the ledger
//   - seenCids: everything already processed (drafted OR committed),
//     so a service restart doesn't re-detect and re-draft old content
//
// This is intentionally a flat JSON file, not a database -- the gateway
// is a thin bridge, not the system of record. The ledger is the system
// of record for anything committed; this file only needs to survive a
// restart long enough not to duplicate in-flight drafts.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from './config.js';

const EMPTY_STATE = { drafts: {}, seenCids: {} };

let state = structuredClone(EMPTY_STATE);

export async function loadState() {
    try {
        const raw = await readFile(config.stateFilePath, 'utf-8');
        state = JSON.parse(raw);
    } catch (err) {
        if (err.code === 'ENOENT') {
            // First run -- no state file yet, start clean.
            state = structuredClone(EMPTY_STATE);
            await persist();
        } else {
            throw err;
        }
    }
    return state;
}

async function persist() {
    await mkdir(dirname(config.stateFilePath), { recursive: true });
    await writeFile(config.stateFilePath, JSON.stringify(state, null, 2));
}

export function hasSeenCid(cid) {
    return Boolean(state.seenCids[cid]);
}

export async function markCidSeen(cid) {
    state.seenCids[cid] = new Date().toISOString();
    await persist();
}

export async function addDraft(draft) {
    state.drafts[draft.videoId] = draft;
    await markCidSeen(draft.cid);
    await persist();
}

export function getDraft(videoId) {
    return state.drafts[videoId] || null;
}

export function listDrafts() {
    return Object.values(state.drafts);
}

export async function removeDraft(videoId) {
    delete state.drafts[videoId];
    await persist();
}
