# Negative Samples

Store negative (confusing / exclusion) samples here.

## Purpose
- Validate anti-signals
- Reduce false positives

## File naming
- target-id.neg.sample-id.json
- Example: agentx.neg.n001.json

## Minimum fields
- sample_id
- target_id
- request_summary
- response_status
- response_headers
- response_body_excerpt
- source
- collected_at
- exclusion_reason

## Example
```json
{
  "sample_id": "n001",
  "target_id": "agentx",
  "request_summary": "GET /",
  "response_status": 200,
  "response_headers": {
    "server": "nginx"
  },
  "response_body_excerpt": "Welcome to nginx!",
  "source": "internal-capture",
  "collected_at": "2026-03-30T00:00:00Z",
  "exclusion_reason": "Generic default page"
}
```
