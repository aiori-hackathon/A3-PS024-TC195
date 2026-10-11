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

        if (attestation !== CONFIG.ATTESTATION_SECRET) {
            console.log('Invalid attestation:', attestation);
            return res.status(403).json({ error: 'Forbidden: Invalid attestation proof' });
        }

        if (!blinded_token) {
            console.log('Missing blinded_token');
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
