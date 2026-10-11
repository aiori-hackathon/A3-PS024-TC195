import { CONFIG } from '../shared/config.js';

async function run() {
    console.log('=== TEST INVALID TOKEN ===');
    const fakeTokenBase64 = Buffer.from('this-is-not-a-valid-privacy-pass-token-bytes').toString('base64');

    console.log('Sending invalid token to Gateway...');
    const res = await fetch(`${CONFIG.GATEWAY_URL}/protected`, {
        headers: { 'Authorization': `PrivateToken ${fakeTokenBase64}` }
    });
    const body = await res.json();
    console.log(`Response (Status ${res.status}):`, body);

    if (res.status === 401) {
        console.log('✅ TEST INVALID TOKEN PASSED');
    } else {
        console.error('❌ TEST INVALID TOKEN FAILED');
        process.exit(1);
    }
}

run().catch(console.error);
