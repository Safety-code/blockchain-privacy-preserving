// server.js
// Entry point. Brings up:
//   - the Fabric Gateway connection (this org's identity)
//   - the IPFS watcher (fallback CID detection)
//   - an Express REST API for the frontend + Pi pipeline
//   - a WebSocket broadcast so the frontend's Pending queue and activity
//     banner update live, without polling (design brief §7)

import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { config } from './config.js';
import { connectFabric, closeFabric } from './fabricClient.js';
import { startWatching, stopWatching } from './ipfsWatcher.js';
import { loadState } from './draftStore.js';
import { bus, EVENTS } from './events.js';
import { router as assetsRouter } from './routes/assets.js';

async function main() {
    await loadState();
    await connectFabric();
    startWatching();

    const app = express();
    app.use(express.json());

    app.get('/health', (req, res) => {
        res.json({ ok: true, org: config.mspId, channel: config.channelName });
    });

    app.use('/api', assetsRouter);

    const httpServer = createServer(app);
    const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

    function broadcast(type, payload) {
        const message = JSON.stringify({ type, payload });
        for (const client of wss.clients) {
            if (client.readyState === client.OPEN) {
                client.send(message);
            }
        }
    }

    bus.on(EVENTS.DRAFT_NEW, (draft) => broadcast('draft:new', draft));
    bus.on(EVENTS.ASSET_COMMITTED, (asset) => broadcast('asset:committed', asset));
    bus.on(EVENTS.ASSET_TRANSFERRED, (info) => broadcast('asset:transferred', info));

    wss.on('connection', (ws) => {
        console.log('[server] frontend client connected via WebSocket');
        ws.on('close', () => console.log('[server] frontend client disconnected'));
    });

    httpServer.listen(config.httpPort, () => {
        console.log(`[server] ${config.orgLabel} gateway listening on :${config.httpPort} (REST + WS)`);
    });

    const shutdown = () => {
        console.log('\n[server] shutting down...');
        stopWatching();
        closeFabric();
        httpServer.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((err) => {
    console.error('[server] fatal startup error:', err);
    process.exit(1);
});
