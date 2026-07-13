// events.js
// Central event bus. The IPFS watcher emits 'draft:new' when it finds an
// unrecognised CID; the REST routes emit 'asset:committed' and
// 'asset:transferred' after a successful chaincode submission. The
// WebSocket layer in server.js subscribes to all three and forwards them
// to connected frontend clients -- this is what makes the "Pending
// Confirmation queue updates without a page refresh" requirement work.

import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();

export const EVENTS = {
    DRAFT_NEW: 'draft:new',
    ASSET_COMMITTED: 'asset:committed',
    ASSET_TRANSFERRED: 'asset:transferred',
};
