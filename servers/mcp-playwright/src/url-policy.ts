import { lookup } from "node:dns/promises";
import net from "node:net";

export const parseAllowedOrigins = (raw: string | undefined) =>
  new Set(
    (raw ?? "https://example.com")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => new URL(entry).origin),
  );

const isPrivateIpv4 = (address: string) => {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
};

const isPrivateIpv6 = (address: string) => {
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
};

const isPrivateAddress = (address: string) => {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return false;
};

const isLocalHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized.endsWith(".localhost");
};

export const assertUrlAllowed = async (rawUrl: string, allowedOrigins: Set<string>, blockPrivateNetworks: boolean) => {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`URL protocol is not allowed: ${url.protocol}`);
  }
  if (!allowedOrigins.has(url.origin)) {
    throw new Error(`URL origin is not allowed: ${url.origin}`);
  }

  if (!blockPrivateNetworks) return url;

  // The origin allowlist is the explicit trust boundary. Private/internal
  // origins are blocked by default because the default allowlist is public.
  // Operators may deliberately allow an internal origin for local evals.
  if (allowedOrigins.has(url.origin)) return url;

  if (isLocalHostname(url.hostname) || isPrivateAddress(url.hostname)) {
    throw new Error(`URL resolves to a private network target: ${url.hostname}`);
  }

  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error(`URL resolves to a private network target: ${url.hostname}`);
  }

  return url;
};
