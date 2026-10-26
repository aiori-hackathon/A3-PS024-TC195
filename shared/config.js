export const CONFIG = {
    ISSUER_PORT: 3001,
    GATEWAY_PORT: 3002,
    ORIGIN_PORT: 3003,
    ISSUER_URL: process.env.ISSUER_URL || 'http://localhost:3001',
    GATEWAY_URL: process.env.GATEWAY_URL || 'http://localhost:3002',
    ORIGIN_URL: process.env.ORIGIN_URL || 'http://localhost:3003',
    ATTESTATION_SECRET: 'lab-attestation-secret-123',
    ISSUER_NAME: 'issuer.com',
    ORIGIN_INFO: ['origin.example.com'],
};
