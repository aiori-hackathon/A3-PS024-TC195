import { generateTokenRequest } from './token.js';
import { CONFIG } from '../shared/config.js';
import { publicVerif } from '@cloudflare/privacypass-ts';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const { TokenResponse } = publicVerif;

async function runSharedProxyTest() {
    console.log('=== STEP 10 & 11: SHARED-PROXY TEST (50 CLIENTS) & LATENCY MEASUREMENTS ===');

    const numClients = 50;
    const results = [];
    let firstTokenBase64 = null;
    let firstTokenBytes = null;

    for (let i = 1; i <= numClients; i++) {
        const tIssStart = Date.now();
        try {
            const { client, tokReq } = await generateTokenRequest();
            const blindedTokenHex = Buffer.from(tokReq.serialize()).toString('hex');

            const issueRes = await fetch(`${CONFIG.ISSUER_URL}/issue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blinded_token: blindedTokenHex, attestation: CONFIG.ATTESTATION_SECRET }),
            });

            if (!issueRes.ok) {
                console.error(`Client ${i} issuance failed:`, await issueRes.text());
                continue;
            }

            const issueData = await issueRes.json();
            const tokenResponse = TokenResponse.deserialize(Buffer.from(issueData.blind_sig, 'hex'));
            const token = await client.finalize(tokenResponse);
            const tIssEnd = Date.now();
            const issuanceLatency = tIssEnd - tIssStart;

            const tokenBytes = token.serialize();
            const tokenBase64 = Buffer.from(tokenBytes).toString('base64');
            const tokenHash = createHash('sha256').update(new Uint8Array(tokenBytes)).digest('hex');

            if (i === 1) {
                firstTokenBase64 = tokenBase64;
                firstTokenBytes = tokenBytes;
            }

            const tRedStart = Date.now();
            const redeemRes = await fetch(`${CONFIG.GATEWAY_URL}/protected`, {
                headers: { 'Authorization': `PrivateToken ${tokenBase64}` }
            });
            const tRedEnd = Date.now();
            const redemptionLatency = tRedEnd - tRedStart;

            results.push({
                client_id: i,
                token_hash: tokenHash,
                status: redeemRes.status,
                issuance_latency_ms: issuanceLatency,
                redemption_latency_ms: redemptionLatency
            });

            if (i % 10 === 0 || i === numClients) {
                console.log(`Progress: ${i}/${numClients} clients successfully processed.`);
            }
        } catch (err) {
            console.error(`Client ${i} error:`, err.message);
        }
    }

    // Replay test with first token
    let replayStatus = 0;
    if (firstTokenBase64) {
        console.log('Running replay test with Token #1...');
        const replayRes = await fetch(`${CONFIG.GATEWAY_URL}/protected`, {
            headers: { 'Authorization': `PrivateToken ${firstTokenBase64}` }
        });
        replayStatus = replayRes.status;
        const replayBody = await replayRes.json();
        console.log(`Replay Response (Status ${replayStatus}):`, replayBody);
    }

    // Export to CSV
    const csvHeader = 'client_id,token_hash,status,issuance_latency_ms,redemption_latency_ms\n';
    const csvRows = results.map(r => `${r.client_id},${r.token_hash},${r.status},${r.issuance_latency_ms},${r.redemption_latency_ms}`).join('\n');

    const csvOutputPath = path.join(import.meta.dirname, '../shared_proxy_results.csv');
    fs.writeFileSync(csvOutputPath, csvHeader + csvRows);
    console.log(`Results saved to ${csvOutputPath}`);

    // Compute latency stats
    const issuances = results.map(r => r.issuance_latency_ms);
    const redemptions = results.map(r => r.redemption_latency_ms);

    function stats(arr) {
        if (arr.length === 0) return { avg: 0, min: 0, max: 0, p95: 0 };
        const sorted = [...arr].sort((a, b) => a - b);
        const sum = sorted.reduce((a, b) => a + b, 0);
        const avg = sum / sorted.length;
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        return { avg: avg.toFixed(2), min, max, p95 };
    }

    console.log('\n--- Latency Statistics (50 Clients) ---');
    console.log('Issuance Latency:', stats(issuances));
    console.log('Redemption Latency:', stats(redemptions));
    console.log(`Replay Protection Test Status: ${replayStatus} (Expected 401)`);
}

runSharedProxyTest().catch(console.error);
