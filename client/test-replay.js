import { generateTokenRequest } from './token.js';
import { CONFIG } from '../shared/config.js';
import { publicVerif } from '@cloudflare/privacypass-ts';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const { TokenResponse, Origin } = publicVerif;

async function run() {
    console.log('=== TEST REPLAY ATTACK ===');
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
    const tokenBase64 = Buffer.from(token.serialize()).toString('base64');

    // First request
    console.log('Sending first redemption request...');
    const res1 = await fetch(`${CONFIG.GATEWAY_URL}/protected`, {
        headers: { 'Authorization': `PrivateToken ${tokenBase64}` }
    });
    const body1 = await res1.json();
    console.log(`Response 1 (Status ${res1.status}):`, body1);

    // Second request (Replay)
    console.log('Sending second redemption request (Replay)...');
    const res2 = await fetch(`${CONFIG.GATEWAY_URL}/protected`, {
        headers: { 'Authorization': `PrivateToken ${tokenBase64}` }
    });
    const body2 = await res2.json();
    console.log(`Response 2 (Status ${res2.status}):`, body2);

    if (res1.status === 200 && res2.status === 401 && body2.error === 'Replay attack detected') {
        console.log('✅ TEST REPLAY PASSED');
    } else {
        console.error('❌ TEST REPLAY FAILED');
        process.exit(1);
    }
}

run().catch(console.error);
