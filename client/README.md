# Client-Side Architecture & Performance — Privacy Pass (PS-024)

## Overview
The Client module (`client/`) is responsible for token lifecycle management, cryptographic blinding, secure wallet storage, and redemption requests.

## Key Client-Side Responsibilities
1. **Challenge Discovery**: Intercepts `401 Unauthorized` responses from the Gateway and extracts the authorized `issuer_url`.
2. **Token Blinding (`client.createTokenRequest`)**:
   - Generates random cryptographic nonces and challenge digests.
   - Masks token requests using RSA-PSS blinding math ($r$ factor) via `@cloudflare/privacypass-ts`.
   - Stores secret blinding factors (`inv`) in memory.
3. **Token Unblinding (`client.finalize`)**:
   - Takes the Issuer's `TokenResponse` (blind signature).
   - Removes the blinding factor to reveal the valid unblinded token.
4. **Token Wallet Management**:
   - Holds unspent tokens securely in memory for subsequent origin requests.

## Performance & UI Optimization (Web Workers)
- **The Challenge**: Cryptographic blinding and unblinding require ~50ms of CPU processing. Running this on the browser's Main UI Thread causes dropped frames and UI stutter.
- **The Solution (Web Workers)**: We implemented a background worker thread (`privacy-pass.worker.js`) to execute all heavy cryptographic math asynchronously. This keeps the user interface buttery smooth at 60 FPS while tokens are generated in the background.

## Benchmark Metrics
- **Token Blinding**: ~51.74 ms
- **Network Issuance Round-Trip**: ~319.82 ms
- **Token Unblinding**: ~5.50 ms
- **Local Verification**: ~0.92 ms
- **Total Processing Time**: ~377.98 ms
