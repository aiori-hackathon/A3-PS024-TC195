import express from 'express';
import { issuer } from './keys.js';
import { CONFIG } from '../shared/config.js';
import { publicVerif } from '@cloudflare/privacypass-ts';

const { TokenRequest, BLIND_RSA } = publicVerif;

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

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.post('/issue', async (req, res) => {
    console.log('POST /issue received request:', req.body);
    try {
        const { blinded_token, attestation } = req.body;

        if (!attestation) {
            return res.status(403).json({ error: 'Forbidden: Missing attestation (Turnstile token)' });
        }

        // Allow lab test secret or verify real Cloudflare Turnstile token
        if (attestation !== CONFIG.ATTESTATION_SECRET) {
            const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    secret: '0x4AAAAAAFjpgqbJ0Ur7lXUAdsE5ezYDK8E',
                    response: attestation
                })
            });
            const verifyData = await verifyRes.json();
            console.log('Turnstile verification result:', verifyData);

            if (!verifyData.success) {
                return res.status(403).json({ error: 'Forbidden: Invalid Cloudflare Turnstile attestation' });
            }
        }

        if (!blinded_token) {
            return res.status(400).json({ error: 'Missing blinded_token' });
        }

        const blindedMsgBytes = Buffer.from(blinded_token, 'hex');
        const tokReq = TokenRequest.deserialize(BLIND_RSA, blindedMsgBytes);

        const tokenResponse = await issuer.issue(tokReq);
        const blindSigHex = Buffer.from(tokenResponse.serialize()).toString('hex');

        res.json({ blind_sig: blindSigHex });
    } catch (err) {
        console.error('Error in /issue:', err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(CONFIG.ISSUER_PORT, () => {
    console.log(`Issuer server running on http://localhost:${CONFIG.ISSUER_PORT}`);
});
