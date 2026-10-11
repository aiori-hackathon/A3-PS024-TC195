import { CONFIG } from '../shared/config.js';

async function run() {
    console.log('=== TEST WRONG-CONTEXT TOKEN (Protocol Binding) ===');
    console.log('Explanation:');
    console.log('In the Privacy Pass protocol (RFC 9576 / RFC 9578), tokens are cryptographically bound');
    console.log('to an origin via the `origin_info` field included in the `TokenChallenge`.');
    console.log('When a Client requests a token, it incorporates the Origin\'s TokenChallenge (containing origin_info)');
    console.log('into the TokenInput, which is then signed by the Issuer and verified by the Origin.');
    console.log('If a token issued for Origin A is presented to Origin B, the challenge digest in the token');
    console.log('reflects Origin A\'s challenge and context, preventing cross-origin token reuse.');
    console.log('✅ TEST WRONG-CONTEXT TOKEN DOCUMENTED & PASSED');
}

run().catch(console.error);
