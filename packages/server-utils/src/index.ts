import path from "node:path";
import { randomUUID } from "node:crypto";

type NextFunction = (error?: unknown) => void;
type RequestLike = {
  header?: (name: string) => string | undefined;
};
type ResponseLike = {
  locals: Record<string, unknown>;
  setHeader: (name: string, value: string) => void;
  status: (status: number) => { json: (body: unknown) => void };
};
type RequestHandlerLike = (req: any, res: any, next: NextFunction) => unknown;

export type ErrorCode =
  | "BAD_REQUEST"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "UPSTREAM_ERROR"
  | "INTERNAL_ERROR";

export type ErrorEnvelope = {
  ok: false;
  error: {
    code: ErrorCode | string;
    message: string;
    details?: unknown;
  };
  requestId: string;
};

export const envFlag = (value: string | undefined, fallback = false) => {
  if (value === undefined || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(value);
};

export const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

export const safePathUnder = (root: string, inputPath: unknown) => {
  const raw = typeof inputPath === "string" ? inputPath : "";
  if (raw.includes("\u0000")) throw new Error("Invalid path");

  const normalizedRoot = path.posix.normalize(root).replace(/\/+$/, "");
  const cleaned = raw.replaceAll("\\", "/");
  if (cleaned.startsWith("/")) throw new Error("Invalid path");
  if (cleaned.split("/").some((segment) => segment === "..")) throw new Error("Invalid path");
  const normalizedRel = path.posix.normalize(`/${cleaned}`).slice(1);

  const full = path.posix.normalize(path.posix.join(normalizedRoot, normalizedRel));
  if (full !== normalizedRoot && !full.startsWith(`${normalizedRoot}/`)) {
    throw new Error("Invalid path");
  }
  return full;
};

const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export const parseBase64Strict = (value: string, maxBytes = Number.POSITIVE_INFINITY) => {
  const normalized = value.trim();
  if (!BASE64_RE.test(normalized)) throw new Error("Invalid base64");
  const buffer = Buffer.from(normalized, "base64");
  if (buffer.byteLength > maxBytes) throw new Error(`Payload too large: ${buffer.byteLength} bytes`);

  const canonical = buffer.toString("base64");
  if (canonical !== normalized) throw new Error("Invalid base64");
  return buffer;
};

export const requestIdFor = (req: RequestLike) => {
  const incoming = req.header?.("x-request-id");
  return incoming && incoming.trim() ? incoming.trim() : randomUUID();
};

export const createErrorEnvelope = (
  code: ErrorCode | string,
  message: string,
  requestId: string,
  details?: unknown,
): ErrorEnvelope => ({
  ok: false,
  error: details === undefined ? { code, message } : { code, message, details },
  requestId,
});

export const createErrorResponse = (
  res: ResponseLike,
  status: number,
  code: ErrorCode | string,
  message: string,
  details?: unknown,
) => {
  const requestId = typeof res.locals.requestId === "string" ? res.locals.requestId : randomUUID();
  res.status(status).json(createErrorEnvelope(code, message, requestId, details));
};

export const asyncRoute =
  (handler: RequestHandlerLike): RequestHandlerLike =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

export const withRequestId = (): RequestHandlerLike => (req, res, next) => {
  const requestId = requestIdFor(req);
  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
};

export const decodeMcpTextJson = (value: unknown): unknown => {
  if (!value || typeof value !== "object") return value;
  const content = (value as { content?: unknown }).content;
  if (!Array.isArray(content)) return value;

  const textItems = content.filter(
    (item): item is { type: "text"; text: string } =>
      Boolean(item) &&
      typeof item === "object" &&
      (item as { type?: unknown }).type === "text" &&
      typeof (item as { text?: unknown }).text === "string",
  );
  if (textItems.length !== 1) return value;

  const text = textItems[0].text;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};
