import { generateTokenRequest } from './token.js';
import { CONFIG } from '../shared/config.js';
import { publicVerif } from '@cloudflare/privacypass-ts';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const { TokenResponse, Origin, BlindRSAMode } = publicVerif;

async function runClientLatencyTest() {
    console.log('=== STEP 1: CLIENT-SIDE WORKFLOW & LATENCY BENCHMARK ===\n');

    // Timer 1: Blinding Phase
    const tBlindStart = performance.now();
    const { client, tokReq, publicKeyBytes } = await generateTokenRequest();
    const tBlindEnd = performance.now();
    const blindingTime = (tBlindEnd - tBlindStart).toFixed(2);
    console.log(`[Client Phase 1] Token Blinding (crypto.subtle + RSA blind): ${blindingTime} ms`);

    const blindedTokenHex = Buffer.from(tokReq.serialize()).toString('hex');

    // Timer 2: Network Issuance Round-trip Phase
    const tIssueStart = performance.now();
    const issueRes = await fetch(`${CONFIG.ISSUER_URL}/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            blinded_token: blindedTokenHex,
            attestation: CONFIG.ATTESTATION_SECRET,
        }),
    });
    const tIssueEnd = performance.now();
    const networkIssueTime = (tIssueEnd - tIssueStart).toFixed(2);

    if (!issueRes.ok) {
        console.error('Issuer error:', await issueRes.text());
        process.exit(1);
    }
    const issueData = await issueRes.json();
    console.log(`[Client Phase 2] Network Issuance Round-Trip (POST /issue): ${networkIssueTime} ms`);

    // Timer 3: Unblinding / Finalization Phase
    const tUnblindStart = performance.now();
    const tokenResponse = TokenResponse.deserialize(Buffer.from(issueData.blind_sig, 'hex'));
    const token = await client.finalize(tokenResponse);
    const tUnblindEnd = performance.now();
    const unblindingTime = (tUnblindEnd - tUnblindStart).toFixed(2);
    console.log(`[Client Phase 3] Token Unblinding & Finalization (client.finalize): ${unblindingTime} ms`);

    // Timer 4: Local Verification Phase
    const tVerifyStart = performance.now();
    const pubJwkPath = path.join(import.meta.dirname, '../issuer/issuer-public-key.json');
    const pubJwk = JSON.parse(fs.readFileSync(pubJwkPath, 'utf8'));
    const publicKey = await webcrypto.subtle.importKey(
        'jwk',
        pubJwk,
        { name: 'RSA-PSS', hash: { name: 'SHA-384' } },
        true,
        ['verify']
    );
    const origin = new Origin(BlindRSAMode.PSS, CONFIG.ORIGIN_INFO);
    const isValid = await origin.verify(token, publicKey);
    const tVerifyEnd = performance.now();
    const verificationTime = (tVerifyEnd - tVerifyStart).toFixed(2);
    console.log(`[Client Phase 4] Local Token Verification (origin.verify): ${verificationTime} ms`);

    const totalClientTime = (Number(blindingTime) + Number(networkIssueTime) + Number(unblindingTime) + Number(verificationTime)).toFixed(2);
    console.log(`\n----------------------------------------`);
    console.log(`Total Client-Side Processing Time: ${totalClientTime} ms`);
    console.log(`Token Valid Status: ${isValid}`);
    console.log(`----------------------------------------\n`);

    console.log('💡 How to Improve Client-Side Latency:');
    console.log('1. Token Pre-Issuance / Wallet Batching: Fetch tokens in batches of 20+ during idle background threads so users never wait during navigation.');
    console.log('2. Asynchronous Web Workers: Offload cryptographic blinding and unblinding to background browser Web Workers to keep UI threads 60 FPS smooth.');
}

runClientLatencyTest().catch(console.error);
