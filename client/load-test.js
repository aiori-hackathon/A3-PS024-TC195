import { generateTokenRequest } from './token.js';
import { CONFIG } from '../shared/config.js';
import { publicVerif } from '@cloudflare/privacypass-ts';
import fs from 'node:fs';
import path from 'node:path';

const { TokenResponse } = publicVerif;

async function runLoadTest() {
    console.log('=== LOAD TESTING & THROUGHPUT BENCHMARK (PS-024) ===');
    const totalRequests = 100; // Scalable to 10,000 for production benchmark
    const concurrency = 10;

    console.log(`Preparing ${totalRequests} unique tokens for load test (concurrency: ${concurrency})...`);

    // Pre-generate tokens to isolate redemption latency from issuance latency
    const tokens = [];
    for (let i = 0; i < totalRequests; i++) {
        try {
            const { client, tokReq } = await generateTokenRequest();
            const blindedTokenHex = Buffer.from(tokReq.serialize()).toString('hex');
            const issueRes = await fetch(`${CONFIG.ISSUER_URL}/issue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blinded_token: blindedTokenHex, attestation: CONFIG.ATTESTATION_SECRET }),
            });
            const issueData = await issueRes.json();
            const tokenResponse = TokenResponse.deserialize(Buffer.from(issueData.blind_sig, 'hex'));
            const token = await client.finalize(tokenResponse);
            tokens.push(Buffer.from(token.serialize()).toString('base64'));
        } catch (err) {
            console.error(`Token generation error at index ${i}:`, err.message);
        }
    }

    console.log(`Successfully generated ${tokens.length} valid tokens. Starting redemption load test...`);

    const latencies = [];
    let successCount = 0;
    let errorCount = 0;

    const startTime = Date.now();

    // Run requests in batches of concurrency
    for (let i = 0; i < tokens.length; i += concurrency) {
        const batch = tokens.slice(i, i + concurrency).map(async (tokenBase64) => {
            const tStart = performance.now();
            try {
                const res = await fetch(`${CONFIG.GATEWAY_URL}/protected`, {
                    headers: { 'Authorization': `PrivateToken ${tokenBase64}` }
                });
                const tEnd = performance.now();
                latencies.push(tEnd - tStart);
                if (res.ok) successCount++;
                else errorCount++;
            } catch (err) {
                errorCount++;
            }
        });
        await Promise.all(batch);
    }

    const totalTimeSec = (Date.now() - startTime) / 1000;
    const throughput = (totalRequests / totalTimeSec).toFixed(2);

    // Compute latency stats
    latencies.sort((a, b) => a - b);
    const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2);
    const min = latencies[0]?.toFixed(2) || 0;
    const max = latencies[latencies.length - 1]?.toFixed(2) || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)]?.toFixed(2) || 0;

    console.log('\n--- Load Test Results ---');
    console.log(`Total Requests: ${totalRequests}`);
    console.log(`Success Count: ${successCount}`);
    console.log(`Error/Replay Count: ${errorCount}`);
    console.log(`Total Time: ${totalTimeSec}s`);
    console.log(`Throughput: ${throughput} req/sec`);
    console.log(`Latency - Avg: ${avg}ms | Min: ${min}ms | Max: ${max}ms | 95th Percentile: ${p95}ms`);

    // Save metrics
    const metrics = {
        totalRequests,
        successCount,
        errorCount,
        totalTimeSec,
        throughput: Number(throughput),
        latency_ms: { avg: Number(avg), min: Number(min), max: Number(max), p95: Number(p95) }
    };
    fs.writeFileSync(path.join(import.meta.dirname, '../load_test_metrics.json'), JSON.stringify(metrics, null, 2));
    console.log('Metrics saved to load_test_metrics.json');
}

runLoadTest().catch(console.error);
