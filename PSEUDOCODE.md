# Pseudocode Snippet: Anti-Replay Cache Logic (Gateway)

Team: **GODSEC**
Problem Statement: **PS-024**

```text
FUNCTION handle_request(request):
    token = request.headers["Authorization"]
    
    IF token IS NULL:
        RETURN 401, { "error": "Token required", "issuer_url": ISSUER_URL }
    
    valid = verify_token(token, ISSUER_PUBLIC_KEY)
    IF valid IS FALSE:
        RETURN 401, { "error": "Invalid token" }
    
    token_hash = SHA256(token)
    is_new = redis.SETNX(token_hash, "1", TTL=3600)
    
    IF is_new IS FALSE:
        RETURN 401, { "error": "Replay attack detected" }
    
    response = forward_to_origin(request)
    RETURN 200, response
```
