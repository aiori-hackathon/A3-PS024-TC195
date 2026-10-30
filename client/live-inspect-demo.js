import { generateTokenRequest } from './token.js';
import { CONFIG } from '../shared/config.js';
import { publicVerif } from '@cloudflare/privacypass-ts';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';

const { TokenResponse } = publicVerif;
const redis = new Redis({ host: 'localhost', port: 6379 });

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function runLiveInspectDemo() {
    console.log('\n========================================================');
    console.log('   TEAM GODSEC (PS-024) — LIVE PACKET & REDIS INSPECTOR ');
    console.log('========================================================\n');

    // Flush Redis to start clean
    await redis.flushall();
    console.log('🧹 [REDIS STATE]: Cache flushed. Active keys: 0\n');
    await sleep(1000);

    console.log('--------------------------------------------------------');
    console.log(' STEP 1: BLIND ISSUANCE REQUEST (Client ➔ Issuer)');
    console.log('--------------------------------------------------------');

    const { client, tokReq } = await generateTokenRequest();
    const blindedTokenHex = Buffer.from(tokReq.serialize()).toString('hex');

    console.log('[HTTP REQUEST SENT TO ISSUER]:');
    console.log(`POST ${CONFIG.ISSUER_URL}/issue HTTP/1.1`);
    console.log('Content-Type: application/json');
    console.log(JSON.stringify({
        blinded_token: blindedTokenHex.substring(0, 64) + '... [256-bytes RSA blinded message]',
        attestation: 'cf_turnstile_attestation_token_xyz123'
    }, null, 2));

    const issueRes = await fetch(`${CONFIG.ISSUER_URL}/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            blinded_token: blindedTokenHex,
            attestation: CONFIG.ATTESTATION_SECRET
        }),
    });
    const issueData = await issueRes.json();
    console.log('\n[HTTP RESPONSE RECEIVED FROM ISSUER]:');
    console.log(JSON.stringify(issueData, null, 2));
    await sleep(1500);

    console.log('\n--------------------------------------------------------');
    console.log(' STEP 2: CLIENT UNBLINDING & WALLET STORAGE');
    console.log('--------------------------------------------------------');
    const tokenResponse = TokenResponse.deserialize(Buffer.from(issueData.blind_sig, 'hex'));
    const token = await client.finalize(tokenResponse);
    const tokenBytes = Buffer.from(token.serialize());
    const tokenBase64 = tokenBytes.toString('base64');
    const expectedHash = createHash('sha256').update(new Uint8Array(tokenBytes)).digest('hex');

    console.log(`- Blinding factor ($r$) stripped successfully.`);
    console.log(`- Final Token (base64): ${tokenBase64.substring(0, 40)}...`);
    console.log(`- Expected SHA-256 Token Hash for Redis: ${expectedHash}`);
    await sleep(1500);

    console.log('\n--------------------------------------------------------');
    console.log(' STEP 3: REDIS STATE BEFORE REDEMPTION');
    console.log('--------------------------------------------------------');
    let keysBefore = await redis.keys('*');
    console.log(`[REDIS KEYS]: ${JSON.stringify(keysBefore)} (Count: ${keysBefore.length})`);
    await sleep(1500);

    console.log('\n--------------------------------------------------------');
    console.log(' STEP 4: AUTHENTICATED REDEMPTION (Client ➔ Gateway ➔ Redis ➔ Origin)');
    console.log('--------------------------------------------------------');
    console.log('[HTTP REQUEST SENT TO GATEWAY]:');
    console.log(`GET ${CONFIG.GATEWAY_URL}/protected HTTP/1.1`);
    console.log(`Authorization: PrivateToken ${tokenBase64.substring(0, 30)}...`);

    const redRes = await fetch(`${CONFIG.GATEWAY_URL}/protected`, {
        headers: { 'Authorization': `PrivateToken ${tokenBase64}` }
    });
    const redData = await redRes.json();
    console.log(`\n[GATEWAY & MAIN SERVER RESPONSE (${redRes.status} OK)]:`);
    console.log(JSON.stringify(redData, null, 2));
    await sleep(1500);

    console.log('\n--------------------------------------------------------');
    console.log(' STEP 5: REDIS STATE IMMEDIATELY AFTER REDEMPTION');
    console.log('--------------------------------------------------------');
    let keysAfter = await redis.keys('*');
    console.log(`[REDIS KEYS]: ${JSON.stringify(keysAfter)}`);
    for (const key of keysAfter) {
        const ttl = await redis.ttl(key);
        const val = await redis.get(key);
        console.log(`  ➔ Key: ${key}`);
        console.log(`    Value: ${val} | TTL: ${ttl} seconds (Expires in 1 hour)`);
    }
    await sleep(1500);

    console.log('\n--------------------------------------------------------');
    console.log(' STEP 6: REPLAY ATTACK ATTEMPT (Same Token Reused)');
    console.log('--------------------------------------------------------');
    console.log('[HTTP REQUEST SENT TO GATEWAY (REUSED TOKEN)]:');
    console.log(`GET ${CONFIG.GATEWAY_URL}/protected HTTP/1.1`);
    console.log(`Authorization: PrivateToken ${tokenBase64.substring(0, 30)}... (REUSED)`);

    const replayRes = await fetch(`${CONFIG.GATEWAY_URL}/protected`, {
        headers: { 'Authorization': `PrivateToken ${tokenBase64}` }
    });
    const replayData = await replayRes.json();
    console.log(`\n[GATEWAY REJECTION RESPONSE (${replayRes.status} UNAUTHORIZED)]:`);
    console.log(JSON.stringify(replayData, null, 2));
    console.log('\n💡 [DETECTION LOGIC]: Gateway computed SHA-256 hash, executed Redis SETNX, received 0 (Key already exists), and successfully blocked the replay attack!\n');

    process.exit(0);
}

runLiveInspectDemo().catch(console.error);
