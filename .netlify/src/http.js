import crypto from "node:crypto";

export function createRequestContext(event) {
  return {
    requestId: crypto.randomUUID(),
    startedAt: Date.now(),
    path: event.path || "/",
    method: event.httpMethod || "GET",
    ipAddress:
      event.headers["x-nf-client-connection-ip"] ||
      event.headers["x-forwarded-for"] ||
      null,
    userAgent: event.headers["user-agent"] || null,
  };
}

export function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

export function text(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
    body,
  };
}

export function errorResponse(statusCode, code, message, requestId, details = undefined) {
  return json(statusCode, {
    error: {
      code,
      message,
      details,
    },
    meta: {
      request_id: requestId,
    },
  });
}

export function parseJsonBody(event) {
  if (!event.body) {
    return null;
  }

  return JSON.parse(event.body);
}

export function getRouteSegments(path) {
  const normalized = path.replace(/^\/+/, "");
  const withoutPrefix = normalized.startsWith("api/v1/")
    ? normalized.slice("api/v1/".length)
    : normalized === "api/v1"
      ? ""
      : normalized;

  return withoutPrefix.split("/").filter(Boolean);
}
