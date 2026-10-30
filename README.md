# Privacy Pass Implementation — Team GODSEC
**Problem Statement**: PS-024 (Anonymous Client Authentication & Shared-IP Protection)  
**Team Code**: A3-PS024-TC195  
**Institution**: National Forensic Sciences University (NFSU)

---

## Overview
This repository contains our complete, production-grade implementation of **Privacy Pass** (IETF RFC 9576 & RFC 9578). 

The system solves the **Shared-IP Collateral Damage** problem (where traditional IP-rate limiting and CAPTCHAs unfairly lock out innocent users behind corporate proxies, university Wi-Fi, or carrier NATs) by decoupling user authorization from session identity using Blind RSA cryptographic tokens.

## Architecture & Components
Our implementation is built as four decoupled Node.js microservices backed by Redis:
- **`issuer/`**: Handles client attestation proofs and issues RSA-PSS blind signatures (`POST /issue`).
- **`gateway/`**: Acts as the edge bouncer. Issues 401 challenge discoveries, cryptographically verifies tokens, and enforces atomic single-use anti-replay protection via Redis (`SETNX`).
- **`origin/`**: The protected main server serving secure content (`/protected`) and hosting the architecture dashboard.
- **`client/`**: Handles token blinding (`token.js`), end-to-end redemption, and our automated test suite.

## Repository Structure
```text
├── issuer/              # Blind RSA issuer server & key management
├── client/              # Token logic, test suite, and shared-proxy benchmark
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

### Step 1: Start Redis
```bash
docker start redis-replay || docker run -d -p 6379:6379 --name redis-replay redis:latest
```

### Step 2: Generate Issuer Keys
```bash
node issuer/keys.js
```

### Step 3: Run the Microservices
Start each service in a separate terminal window:
```bash
# Terminal 1: Issuer
node issuer/index.js

# Terminal 2: Main Server / Origin
node origin/index.js

# Terminal 3: Gateway
node gateway/index.js
```

### Step 4: Run the Test Suite
We've included automated test scripts covering all required scenarios:
```bash
# Test replay attack prevention
node client/test-replay.js

# Test invalid token rejection
node client/test-invalid.js

# Test shared-proxy scenario (50 concurrent clients behind same IP)
node client/shared-proxy-test.js

# Run latency & throughput benchmarks
node client/load-test.js
```

## Performance & Scalability
- **Throughput**: `1,181+ req/sec` under concurrent load.
- **Redemption Latency**: Average `~29.73ms` (p95: `76.56ms`), powered by in-memory Redis `SETNX` and offline public-key verification.
- **Scalability Design**: Built for horizontal scaling up to 10M+ DAU using distributed Redis clustering and stateless edge gateways.
