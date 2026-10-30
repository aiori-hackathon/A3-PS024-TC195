import { generateTokenRequest } from './token.js';
import { CONFIG } from '../shared/config.js';
import { publicVerif } from '@cloudflare/privacypass-ts';
import fs from 'node:fs';
import path from 'node:path';

const { TokenResponse } = publicVerif;

async function runDemo10KTest() {
    console.log('========================================================');
    console.log('   TEAM GODSEC (PS-024) — 10,000 REQUEST LIVE DEMO     ');
    console.log('========================================================');

    const totalRequests = 10000;
    const concurrency = 100;

    console.log(`[1/3] Generating ${totalRequests} tokens (Concurrency: ${concurrency})... This may take a moment for 10K requests.`);

    const tokens = [];
    const tGenStart = performance.now();

    // Generate tokens in chunks
    for (let i = 0; i < totalRequests; i += concurrency) {
        const batch = [];
        for (let j = 0; j < concurrency && (i + j) < totalRequests; j++) {
            batch.push((async () => {
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
                    return Buffer.from(token.serialize()).toString('base64');
                } catch (err) {
                    return null;
                }
            })());
        }
        const results = await Promise.all(batch);
        results.forEach(t => { if (t) tokens.push(t); });
        process.stdout.write(`\rGenerated ${tokens.length} / ${totalRequests} tokens...`);
    }

    const tGenEnd = performance.now();
    console.log(`\nSuccessfully prepared ${tokens.length} valid tokens in ${((tGenEnd - tGenStart)/1000).toFixed(2)}s.`);

    console.log(`[2/3] Executing 10,000 request high-throughput redemption load test...`);
    const latencies = [];
    let successCount = 0;
    let errorCount = 0;

    const startTime = performance.now();

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
        process.stdout.write(`\rProcessed ${Math.min(i + concurrency, tokens.length)} / ${tokens.length} redemptions...`);
    }

    const totalTimeSec = (performance.now() - startTime) / 1000;
    const throughput = (tokens.length / (totalTimeSec || 0.001)).toFixed(2);

    latencies.sort((a, b) => a - b);
    const avg = (latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1)).toFixed(2);
    const min = latencies[0]?.toFixed(2) || 0;
    const max = latencies[latencies.length - 1]?.toFixed(2) || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)]?.toFixed(2) || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)]?.toFixed(2) || 0;

    console.log('\n\n========================================================');
    console.log('         10,000 REQUEST BENCHMARK RESULTS REPORT        ');
    console.log('========================================================');
    console.log(`Total Requests: ${tokens.length}`);
    console.log(`Success Count (200 OK): ${successCount}`);
    console.log(`Error/Replay Count: ${errorCount}`);
    console.log(`Total Duration: ${totalTimeSec}s`);
    console.log(`Achieved Throughput: ${throughput} req/sec`);
    console.log(`Redemption Latency (10K Concurrency Batch):`);
    console.log(`  - Average: ${avg}ms`);
    console.log(`  - Min: ${min}ms`);
    console.log(`  - Max: ${max}ms`);
    console.log(`  - 95th Percentile: ${p95}ms`);
    console.log(`  - 99th Percentile: ${p99}ms`);
    console.log('========================================================\n');

    const metrics = {
        totalRequests: tokens.length,
        successCount,
        errorCount,
        totalTimeSec,
        throughput: Number(throughput),
        latency_ms: { avg: Number(avg), min: Number(min), max: Number(max), p95: Number(p95), p99: Number(p99) }
    };
    fs.writeFileSync(path.join(import.meta.dirname, '../demo_10k_metrics.json'), JSON.stringify(metrics, null, 2));
    console.log('Metrics saved to demo_10k_metrics.json');
}

runDemo10KTest().catch(console.error);
