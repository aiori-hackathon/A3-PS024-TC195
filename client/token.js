import { publicVerif } from "@cloudflare/privacypass-ts";
import { webcrypto } from "node:crypto";
import fs from 'node:fs';
import path from "node:path";
import { CONFIG } from '../shared/config.js';

const { BlindRSAMode, Client, Origin, getPublicKeyBytes } = publicVerif;

const pubJwkPath = path.join(import.meta.dirname, '../issuer/issuer-public-key.json');
const pubJwk = JSON.parse(fs.readFileSync(pubJwkPath, 'utf8'));

const publicKey = await webcrypto.subtle.importKey(
    'jwk',
    pubJwk,
    { name: 'RSA-PSS', hash: { name: 'SHA-384' } },
    true,
    ['verify']
);

const publicKeyBytes = await getPublicKeyBytes(publicKey);

export async function generateTokenRequest() {
    const client = new Client(BlindRSAMode.PSS);
    const origin = new Origin(BlindRSAMode.PSS, CONFIG.ORIGIN_INFO);
    const redemptionContext = webcrypto.getRandomValues(new Uint8Array(32));
    const tokChl = origin.createTokenChallenge(CONFIG.ISSUER_NAME, redemptionContext);

    const tokReq = await client.createTokenRequest(tokChl, publicKeyBytes);

    return { client, tokReq, publicKeyBytes };
}
