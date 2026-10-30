# Privacy Pass Implementation — Team GODSEC
**Problem Statement**: PS-024 (Anonymous Client Authentication & Shared-IP Protection)  
**Team Code**: A3-PS024-TC195  
**Institution**: National Forensic Sciences University (NFSU)

---

# OFFICIAL PROJECT PRESENTATION & DEMO VIDEO
## Watch on YouTube: [https://youtu.be/MD2GklwGeUY](https://youtu.be/MD2GklwGeUY)

---

## 1. Executive Summary & Problem Scope

### The Shared-IP Collateral Damage & Availability Crisis
Modern web infrastructure routinely relies on IP-based rate limiting and IP blocking to detect abuse, enforce rate quotas, and mitigate Distributed Denial of Service (DDoS) attacks. However, this creates a severe collateral damage and availability crisis:
- Millions of legitimate users share a single public IP address, such as students on a university campus Wi-Fi, employees behind a corporate NAT firewall, or mobile users on Carrier-Grade NAT (CGNAT).
- When a single misbehaving bot or scraper triggers an IP block, every innocent user sharing that IP address gets blocked or bombarded with endless CAPTCHAs, destroying service availability for real humans.

### Threat Scope & What Privacy Pass Protects Against
Privacy Pass is not designed to prevent server-side vulnerabilities such as SQL injections, Remote Code Execution (RCE), or unauthorized database access (which remain the domain of Web Application Firewalls and secure authentication mechanisms like OAuth or JWT). 

Instead, Privacy Pass is specifically engineered to solve **Layer 7 Application Abuse**:
1. **DDoS & Volumetric Bot Attacks**: Stopping automated requests from overwhelming origin servers.
2. **Scraping & Credential Stuffing**: Preventing automated harvesting of data at scale.
3. **Shared-IP Rate-Limiting Collateral Damage**: Ensuring legitimate human users behind shared proxies and subnets are not wrongfully blocked.

---

## 2. System Architecture & Protocol Flow

```
+--------+                      +---------+                     +---------+                      +-------------+
| Client |                      | Issuer  |                     | Gateway |                      | Main Server |
+--------+                      +---------+                     +---------+                      +-------------+
    |                                |                               |                                |
    |---- GET /protected ----------->|                               |                                |
    |<--- 401 Unauthorized + URL ----|                               |                                |
    |                                |                               |                                |
    |---- POST /issue (TokenReq) --->|                               |                                |
    |     [Turnstile Attestation]    |                               |                                |
    |<--- Blind Sig (TokenResp) -----|                               |                                |
    |                                                                                                 |
    |---- GET /protected (Authorization: PrivateToken s(T)) -------->|                                |
    |                                                                |-- Cryptographic Verification ->|
    |                                                                |-- Atomic Redis SETNX Check --->|
    |                                                                |<-- 200 OK + Protected Data ----|
    |<--- 200 OK + Protected Data -----------------------------------|                                |
```

### The Gateway 4-Step Validation Pipeline (Crypto-First Gatekeeping)
To achieve sub-30ms performance while neutralizing cache-poisoning Denial of Service (DoS) attacks, our Gateway enforces a strict defense-in-depth validation sequence:
1. **Header Check**: Verifies the presence of the `PrivateToken` authorization header (fast 401 rejection).
2. **Structure Check**: Deserializes raw base64/hex bytes into structured RFC 9576 token packets.
3. **Cryptographic Signature Verification**: Verifies the RSA-PSS signature against the Issuer's public key (`origin.verify`). 
   - *Design Rationale (Crypto-First Gatekeeping)*: By verifying cryptographic validity *before* touching the database, we ensure that only valid tokens reach Redis. Forged or corrupted tokens are instantly dropped in CPU, completely preventing cache-flooding memory exhaustion.
4. **Anti-Replay Cache Check**: Computes the SHA-256 hash of the token and checks Redis using atomic `SETNX` with a 1-hour TTL (`EX 3600`).
5. **Origin Forwarding**: Forwards authorized requests to the Main Server.

---

## 3. Cryptographic Design Decisions

### Why Blind RSA (RSA-PSS) over VOPRF?
Under RFC 9576/9578, Privacy Pass supports Blind RSA (RSABSSA) and Verifiable Oblivious PRF (VOPRF). We selected **RSA-PSS with SHA-384**:
- **Advantages**: Backed by decades of battle-tested cryptographic security history, universal enterprise Hardware Security Module (HSM) support, and robust library ecosystem stability (`@cloudflare/privacypass-ts`).
- **Disadvantages**: Larger key and signature sizes (2048-bit / 3072-bit) compared to 32-byte elliptic curves, resulting in slightly higher network packet overhead.

### 24-Hour Key Rotation & Signature Harvesting Mitigation
- **Mitigating Signature Harvesting**: If an Issuer signs an enormous volume of tokens over months using a static RSA private key, advanced algebraic cryptanalysis could theoretically weaken the private key. Daily key rotation limits the cryptanalytic attack surface.
- **Dynamic Public Key Synchronization**: As keys rotate daily on the Issuer, the Gateway dynamically fetches updated public keys across key epochs using an authorized API call and JWKS keyring synchronization, guaranteeing zero-downtime epoch transitions.

---

## 4. Scalability & Performance Benchmarks

Stress testing simulating high concurrency and 10M DAU projections yielded the following metrics:
- **Throughput**: 1,181.51 req/sec
- **Redemption Latency**: Average 29.73ms (95th Percentile: 76.56ms, 99th Percentile: 91.70ms)
- **10M DAU Peak Headroom**: Exceeds peak load requirements (~11,575 QPS) via horizontal Gateway auto-scaling and a sharded Redis cluster.

---

## 5. Repository Structure
```text
├── issuer/              # Blind RSA issuer server & key management
├── client/              # Token logic, test suite, and scale benchmark
├── gateway/             # Verification gateway & Redis anti-replay cache
├── origin/              # Protected main server & web dashboard
├── shared/              # Shared configuration constants
├── docker-compose.yml   # Multi-service container orchestration
├── Proposed-structure-hackathon.pdf # Official project report presentation
├── PROGRESS_REPORT.md   # 10M DAU scaling benchmarks & pipeline report
├── PSEUDOCODE.md        # Anti-replay cache logic snippet
└── README.md
```

## Getting Started & Running Locally

### Prerequisites
- Node.js (v18+)
- Docker & Docker Compose

### Step 1: Start Services via Docker Compose
```bash
docker compose up --build -d
```

### Step 2: Run the Test Suite
```bash
# Test replay attack prevention
node client/test-replay.js

# Test invalid token rejection
node client/test-invalid.js

# Run throughput benchmarks
node client/load-test.js
```
