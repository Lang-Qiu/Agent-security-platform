let requestCounter = 0;

export function createRequestId(): string {
  requestCounter += 1;
  return `req_${requestCounter.toString().padStart(6, "0")}`;
}
