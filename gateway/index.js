import express from 'express';
import Redis from 'ioredis';
import { CONFIG } from '../shared/config.js';
import { publicVerif, Token } from '@cloudflare/privacypass-ts';
import { webcrypto, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { generateTokenRequest } from '../client/token.js';

const { Origin, BLIND_RSA, BlindRSAMode, TokenResponse } = publicVerif;

const app = express();
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

const redis = new Redis({
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
        if (times > 3) {
            return null;
        }
        return Math.min(times * 50, 2000);
    }
});

redis.on('error', (err) => {
    console.error('Redis connection error:', err.message);
});

// Load public key
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

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Dashboard helper endpoint to generate a valid Privacy Pass token end-to-end
app.get('/api/get-token', async (req, res) => {
    try {
        const { client, tokReq } = await generateTokenRequest();
        const blindedTokenHex = Buffer.from(tokReq.serialize()).toString('hex');

        const issuerRes = await fetch(`${CONFIG.ISSUER_URL}/issue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                blinded_token: blindedTokenHex,
                attestation: CONFIG.ATTESTATION_SECRET
            })
        });
        const issuerData = await issuerRes.json();
        if (!issuerRes.ok) {
            return res.status(500).json({ error: issuerData.error || 'Issuer failed' });
        }

        const tokenResponse = TokenResponse.deserialize(Buffer.from(issuerData.blind_sig, 'hex'));
        const token = await client.finalize(tokenResponse);
        const tokenBase64 = Buffer.from(token.serialize()).toString('base64');
        res.json({ token: tokenBase64 });
    } catch (err) {
        console.error('Error generating token via API:', err);
        res.status(500).json({ error: err.message });
    }
});

async function handleProtected(req, res) {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('PrivateToken ')) {
            return res.status(401).json({
                error: 'Token required',
                issuer_url: CONFIG.ISSUER_URL
            });
        }

        const tokenStr = authHeader.replace('PrivateToken ', '').trim();
        let tokenBytes;
        try {
            tokenBytes = Buffer.from(tokenStr, 'base64');
        } catch {
            try {
                tokenBytes = Buffer.from(tokenStr, 'hex');
            } catch (e) {
                return res.status(401).json({ error: 'Invalid token format' });
            }
        }

        let token;
        try {
            const cleanBytes = new Uint8Array(tokenBytes);
            token = Token.deserialize(BLIND_RSA, cleanBytes);
        } catch (e) {
            return res.status(401).json({ error: 'Invalid token deserialization: ' + e.message });
        }

        const isValid = await origin.verify(token, publicKey);

        if (!isValid) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const tokenHash = createHash('sha256').update(new Uint8Array(tokenBytes)).digest('hex');

        let redisSet;
        try {
            redisSet = await redis.set(tokenHash, '1', 'EX', 3600, 'NX');
        } catch (err) {
            console.error('Redis error during SETNX:', err.message);
            return res.status(500).json({ error: 'Redis replay cache unavailable' });
        }

        if (redisSet !== 'OK') {
            return res.status(401).json({ error: 'Replay attack detected' });
        }

        // Forward request to Origin
        const originResponse = await fetch(`${CONFIG.ORIGIN_URL}/protected`, {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        const originData = await originResponse.json();
        res.status(originResponse.status).json(originData);

    } catch (err) {
        console.error('Error in Gateway /protected:', err);
        res.status(500).json({ error: err.message });
    }
}

app.get('/protected', handleProtected);
app.post('/protected', handleProtected);

app.listen(CONFIG.GATEWAY_PORT, () => {
    console.log(`Gateway server running on http://localhost:${CONFIG.GATEWAY_PORT}`);
});
