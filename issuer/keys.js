import { publicVerif } from '@cloudflare/privacypass-ts';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const { BlindRSAMode, Issuer, getPublicKeyBytes } = publicVerif;

const privKeyPath = path.join(import.meta.dirname, 'issuer-private-key.json');
const pubKeyPath = path.join(import.meta.dirname, 'issuer-public-key.json');

let privateKey, publicKey;

if (fs.existsSync(privKeyPath) && fs.existsSync(pubKeyPath)) {
    const privJwk = JSON.parse(fs.readFileSync(privKeyPath, 'utf8'));
    const pubJwk = JSON.parse(fs.readFileSync(pubKeyPath, 'utf8'));

    privateKey = await webcrypto.subtle.importKey(
        'jwk',
        privJwk,
        { name: 'RSA-PSS', hash: { name: 'SHA-384' } },
        true,
        ['sign']
    );
    publicKey = await webcrypto.subtle.importKey(
        'jwk',
        pubJwk,
        { name: 'RSA-PSS', hash: { name: 'SHA-384' } },
        true,
        ['verify']
    );
} else {
    const keys = await Issuer.generateKey(BlindRSAMode.PSS, {
        modulusLength: 2048,
        publicExponent: Uint8Array.from([1, 0, 1]),
    });
    privateKey = keys.privateKey;
    publicKey = keys.publicKey;

    const privJwk = await webcrypto.subtle.exportKey('jwk', privateKey);
    const pubJwk = await webcrypto.subtle.exportKey('jwk', publicKey);

    fs.writeFileSync(privKeyPath, JSON.stringify(privJwk, null, 2));
    fs.writeFileSync(pubKeyPath, JSON.stringify(pubJwk, null, 2));
}

const issuer = new Issuer(BlindRSAMode.PSS, 'issuer.com', privateKey, publicKey);
const pubBytes = await getPublicKeyBytes(publicKey);

console.log('Public key (hex):', Buffer.from(pubBytes).toString('hex'));

export { issuer, privateKey, publicKey, pubBytes };
