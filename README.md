# Privacy Pass System — Team GODSEC (PS-024)

An enterprise-grade, end-to-end implementation of **Privacy Pass** (RFC 9576 / RFC 9578) featuring Blind RSA token issuance, client blinding/unblinding, gateway verification with Redis-backed anti-replay protection (`SETNX`), and shared-proxy anonymous access.

## Team Name
**GODSEC**

---

## 📋 Requirements Checklist (Status: 100% Complete)

| Requirement | Status | Implementation Details |
| :--- | :---: | :--- |
| **1. Implement 1 RFC 9578 issuance protocol** | ✅ **Done** | Blind RSA (RSABSSA SHA-384 PSS deterministic mode) via Cloudflare libraries. |
| **2. Isolated issuer and origin keys** | ✅ **Done** | Cryptographic key generation & JWK persistence (`issuer-private-key.json`, `issuer-public-key.json`). |
| **3. Issuer, client & verification gateway** | ✅ **Done** | Fully decoupled microservices (`issuer/`, `client/`, `gateway/`, `origin/`). |
| **4. Enforce single redemption via replay cache** | ✅ **Done** | Atomic Redis `SETNX` with 1-hour TTL (`EX 3600`) using SHA-256 token hashes. |
| **5. Reject reused, invalid & wrong-context tokens** | ✅ **Done** | Verified via test suite (`test-replay.js`, `test-invalid.js`, `test-wrong-context.js`). |
| **6. Shared-proxy test scenario** | ✅ **Done** | Tested via `shared-proxy-test.js` (50 concurrent clients behind same gateway IP). |
| **7. Measure issuance & redemption latency** | ✅ **Done** | Benchmarked via `load-test.js` (`load_test_metrics.json`, `shared_proxy_results.csv`). |
| **8. Identify metadata retention per component** | ✅ **Done** | Documented in report artifact (`proposed_structure_hackathon.artifact.md`). |
| **9. Treat ARC as optional extension** | ✅ **Done** | Addressed in limitations and future work. |
| **10. Privacy Pass scope adherence** | ✅ **Done** | No new crypto; correctly isolates transport IP privacy from application authorization. |

---

## 📊 Performance & Latency Benchmarks
- **Throughput**: `735.29 req/sec`
- **Average Redemption Latency**: `9.99 ms` (p95: `15.87 ms`)
- **Issuance Latency**: `~480 ms` (one-time setup cost for RSA-PSS signing)

---

## 🚀 Quick Start & Running the Demo

1. **Start Redis**:
   ```bash
   docker start redis-replay || docker run -d -p 6379:6379 --name redis-replay redis:latest
   ```

2. **Generate Issuer Keys**:
   ```bash
   node issuer/keys.js
   ```

3. **Start the Microservices**:
   ```bash
   node issuer/index.js &
   node gateway/index.js &
   node origin/index.js &
   ```

4. **Access the Web Dashboard & Live Architecture**:
   Open **[http://localhost:3003](http://localhost:3003)** in your browser.

5. **Run the Test Suite**:
   ```bash
   node client/test-replay.js
   node client/test-invalid.js
   node client/shared-proxy-test.js
   node client/load-test.js
   ```
