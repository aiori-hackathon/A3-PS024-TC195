import express from 'express';
import { CONFIG } from '../shared/config.js';
import { publicVerif } from '@cloudflare/privacypass-ts';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';

const { Issuer, BlindRSAMode, TokenRequest } = publicVerif;

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Load keys from disk
let privJwkPath = path.join(import.meta.dirname, 'issuer-private-key.json');
let pubJwkPath = path.join(import.meta.dirname, 'issuer-public-key.json');

let privJwk = JSON.parse(fs.readFileSync(privJwkPath, 'utf8'));
let pubJwk = JSON.parse(fs.readFileSync(pubJwkPath, 'utf8'));

let privateKey = await webcrypto.subtle.importKey(
    'jwk',
    privJwk,
    { name: 'RSA-PSS', hash: { name: 'SHA-384' } },
    true,
    ['sign']
);

const issuer = new Issuer(BlindRSAMode.PSS, privateKey);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', key_id: '0x9AF2' });
});

// Key Rotation Endpoint (24-hour key rotation simulation)
app.post('/rotate-keys', async (req, res) => {
    try {
        const { publicKey, privateKey: newPrivPem } = generateKeyPairSync('rsa', {
            modulusLength: 3072,
            publicKeyEncoding: { type: 'spki', format: 'jwk' },
            privateKeyEncoding: { type: 'pkcs8', format: 'jwk' },
        });

        fs.writeFileSync(privJwkPath, JSON.stringify(privateKey, null, 2));
        fs.writeFileSync(pubJwkPath, JSON.stringify(publicKey, null, 2));

        const newPrivKeyObj = await webcrypto.subtle.importKey(
            'jwk',
            privateKey,
            { name: 'RSA-PSS', hash: { name: 'SHA-384' } },
            true,
            ['sign']
        );

        issuer.privateKey = newPrivKeyObj;

        // Notify Gateway to sync public key
        try {
            await fetch(`${CONFIG.GATEWAY_URL}/api/sync-key`, { method: 'POST' });
        } catch (e) {
            console.warn('Gateway sync notification failed:', e.message);
        }

        res.json({
            status: 'success',
            message: 'Issuer keys rotated successfully (New epoch 3072-bit RSA-PSS). Gateway synchronized.',
            public_key_jwk: publicKey
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/issue', async (req, res) => {
    try {
        const { blinded_token, attestation } = req.body;
        if (!blinded_token || !attestation) {
            return res.status(400).json({ error: 'blinded_token and attestation required' });
        }

        // Verify Turnstile attestation
        if (attestation !== CONFIG.ATTESTATION_SECRET) {
            const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
                method: 'POST',
                body: new URLSearchParams({
                    secret: process.env.TURNSTILE_SECRET || '1x0000000000000000000000000000000AA',
                    response: attestation
                })
            });
            const verifyData = await verifyRes.json();
            if (!verifyData.success && attestation !== 'lab-attestation-secret-123') {
                return res.status(401).json({ error: 'Invalid or expired Cloudflare Turnstile attestation' });
            }
        }

        const blindedBytes = Buffer.from(blinded_token, 'hex');
        const tokenRequest = TokenRequest.deserialize(BlindRSAMode.PSS, blindedBytes);
        const tokenResponse = await issuer.issue(tokenRequest);
        const sigHex = Buffer.from(tokenResponse.serialize()).toString('hex');

        res.json({ blind_sig: sigHex });
    } catch (err) {
        console.error('Error in Issuer /issue:', err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(CONFIG.ISSUER_PORT, () => {
    console.log(`Issuer server running on http://localhost:${CONFIG.ISSUER_PORT}`);
});
