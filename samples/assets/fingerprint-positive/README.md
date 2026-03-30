# Positive Samples

Store positive fingerprint samples here.

## File naming
- target-id.sample-id.json
- Example: agentx.s001.json

## Minimum fields
- sample_id
- target_id
- request_summary
- response_status
- response_headers
- response_body_excerpt
- source
- collected_at

## Example
```json
{
  "sample_id": "s001",
  "target_id": "agentx",
  "request_summary": "GET /health",
  "response_status": 200,
  "response_headers": {
    "server": "agentx"
  },
  "response_body_excerpt": "{\"status\":\"ok\"}",
  "source": "internal-capture",
  "collected_at": "2026-03-30T00:00:00Z"
}
```
