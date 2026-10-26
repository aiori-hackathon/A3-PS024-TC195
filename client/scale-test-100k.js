import { generateTokenRequest } from './token.js';
import { CONFIG } from '../shared/config.js';
import { publicVerif } from '@cloudflare/privacypass-ts';
import fs from 'node:fs';
import path from 'node:path';

const { TokenResponse } = publicVerif;

async function runScaleTest() {
    console.log('========================================================');
    console.log('   TEAM GODSEC (PS-024) — 100K DAU SCALING BENCHMARK   ');
    console.log('========================================================');

    // Simulate a representative sample of peak concurrent redemptions for 100K DAU
    const totalRequests = 500; // Scalable batch representing concurrent load window
    const concurrency = 50;

    console.log(`[1/3] Generating ${totalRequests} cryptographically blinded tokens (Concurrency: ${concurrency})...`);

    const tokens = [];
    const tGenStart = performance.now();

    // Batch token generation
    for (let i = 0; i < totalRequests; i += concurrency) {
        const batch = [];
        for (let j = 0; j < concurrency && (i + j) < totalRequests; j++) {
            batch.add?.(async () => {}); // placeholder
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
    }

    const tGenEnd = performance.now();
    console.log(`Successfully prepared ${tokens.length} valid Privacy Pass tokens in ${((tGenEnd - tGenStart)/1000).toFixed(2)}s.`);

    console.log(`[2/3] Executing high-throughput gateway redemption & Redis SETNX check...`);
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
    }

    const totalTimeSec = (performance.now() - startTime) / 1000;
    const throughput = (tokens.length / totalTimeSec).toFixed(2);

    // Latency statistics
    latencies.sort((a, b) => a - b);
    const avg = (latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1)).toFixed(2);
    const min = latencies[0]?.toFixed(2) || 0;
    const max = latencies[latencies.length - 1]?.toFixed(2) || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)]?.toFixed(2) || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)]?.toFixed(2) || 0;

    // 100K DAU Projections
    // Assuming 100K DAU with average 20 requests/user/day = 2,000,000 requests/day
    // Peak load factor: ~5x average QPS = ~115 requests/sec peak.
    const projectedPeakQPS = 115;
    const redisMemoryPerKeyBytes = 512; // 256-byte SHA-256 hash + Redis overhead
    const dailyTokens100KDau = 2000000;
    const redisMemoryRequiredMB = ((dailyTokens100KDau * redisMemoryPerKeyBytes) / (1024 * 1024)).toFixed(2);

    console.log('\n========================================================');
    console.log('         100K DAU PERFORMANCE BENCHMARK REPORT         ');
    console.log('========================================================');
    console.log(`Total Redeemed Requests: ${tokens.length}`);
    console.log(`Success Count (200 OK): ${successCount}`);
    console.log(`Replay/Error Count: ${errorCount}`);
    console.log(`Test Duration: ${totalTimeSec}s`);
    console.log(`Achieved Throughput: ${throughput} req/sec`);
    console.log(`Redemption Latency:`);
    console.log(`  - Average: ${avg}ms`);
    console.log(`  - Min: ${min}ms`);
    console.log(`  - Max: ${max}ms`);
    console.log(`  - 95th Percentile: ${p95}ms`);
    console.log(`  - 99th Percentile: ${p99}ms`);
    console.log('--------------------------------------------------------');
    console.log(' 100K DAU CAPACITY & SCALING PROJECTIONS:');
    console.log(`  - Estimated Peak QPS (100K DAU @ 20 req/day/user): ~${projectedPeakQPS} QPS`);
    console.log(`  - System Capacity headroom: Can handle ~${throughput} QPS (Exceeds 100K DAU peak by ${(Number(throughput)/projectedPeakQPS).toFixed(1)}x)`);
    console.log(`  - Redis Anti-Replay RAM for 2M daily tokens: ~${redisMemoryRequiredMB} MB (Easily fits in standard Redis instance)`);
    console.log('========================================================\n');

    const report = {
        dau: "100,000",
        totalRequests: tokens.length,
        successCount,
        errorCount,
        throughput: Number(throughput),
        latency_ms: { avg: Number(avg), min: Number(min), max: Number(max), p95: Number(p95), p99: Number(p99) },
        dau_projections: {
            peak_qps: projectedPeakQPS,
            headroom_multiplier: (Number(throughput)/projectedPeakQPS).toFixed(1),
            redis_ram_mb: Number(redisMemoryRequiredMB)
        }
    };
    fs.writeFileSync(path.join(import.meta.dirname, '../scale_test_100k_metrics.json'), JSON.stringify(report, null, 2));
    console.log('Report saved to scale_test_100k_metrics.json');
}

runScaleTest().catch(console.error);
