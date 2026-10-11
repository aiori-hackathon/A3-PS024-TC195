import { generateTokenRequest } from './token.js';
import { CONFIG } from '../shared/config.js';
import { publicVerif } from '@cloudflare/privacypass-ts';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const { TokenResponse, Origin } = publicVerif;

async function main() {
    console.log('1. Generating token request (blinding)...');
    const { client, tokReq } = await generateTokenRequest();
    const blindedTokenHex = Buffer.from(tokReq.serialize()).toString('hex');
    console.log('Blinded token (hex):', blindedTokenHex);

    console.log('2. Requesting signature from Issuer...');
    const issueResponse = await fetch(`${CONFIG.ISSUER_URL}/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            blinded_token: blindedTokenHex,
            attestation: CONFIG.ATTESTATION_SECRET,
        }),
    });

    if (!issueResponse.ok) {
        const errText = await issueResponse.text();
        console.error('Issuer error:', errText);
        process.exit(1);
    }

    const issueData = await issueResponse.json();
    console.log('Received blind signature from Issuer.');

    console.log('3. Unblinding token...');
    const tokenResponse = TokenResponse.deserialize(Buffer.from(issueData.blind_sig, 'hex'));
    const token = await client.finalize(tokenResponse);

    console.log('4. Verifying token locally...');
    const pubJwkPath = path.join(import.meta.dirname, '../issuer/issuer-public-key.json');
    const pubJwk = JSON.parse(fs.readFileSync(pubJwkPath, 'utf8'));
    const publicKey = await webcrypto.subtle.importKey(
        'jwk',
        pubJwk,
        { name: 'RSA-PSS', hash: 'SHA-384' },
        true,
        ['verify']
    );

    const origin = new Origin(publicVerif.BlindRSAMode.PSS, CONFIG.ORIGIN_INFO);
    const isValid = await origin.verify(token, publicKey);
    console.log('Valid token:', isValid);

    if (!isValid) {
        console.error('Token verification failed!');
        process.exit(1);
    }

    const tokenBase64 = Buffer.from(token.serialize()).toString('base64');
    console.log('Final token (base64):', tokenBase64);

    console.log('\n--- Step 7: Redeeming Token at Gateway ---');
    console.log('Sending first request to Gateway...');
    const protectedResponse1 = await fetch(`${CONFIG.GATEWAY_URL}/protected`, {
        method: 'GET',
        headers: {
            'Authorization': `PrivateToken ${tokenBase64}`,
        },
    });

    console.log('Gateway status:', protectedResponse1.status);
    const body1 = await protectedResponse1.json();
    console.log('Gateway response 1:', body1);

    console.log('\nSending second request (Replay Test)...');
    const protectedResponse2 = await fetch(`${CONFIG.GATEWAY_URL}/protected`, {
        method: 'GET',
        headers: {
            'Authorization': `PrivateToken ${tokenBase64}`,
        },
    });

    console.log('Gateway status (replay):', protectedResponse2.status);
    const body2 = await protectedResponse2.json();
    console.log('Gateway response 2:', body2);
}

main().catch(console.error);
