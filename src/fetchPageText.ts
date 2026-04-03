import { backend } from ".";
import { warnLog } from "./logger";

const ALLOWED_SCHEMES = ['http:', 'https:'];

const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^\[::1\]$/,
  /^\[fe80:/i,
  /^\[fc/i,
  /^\[fd/i,
];

function validateUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
    warnLog(`Blocked URL with disallowed scheme: ${parsed.protocol}`);
    throw new Error(`Disallowed URL scheme: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname;
  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      warnLog(`Blocked URL with private/reserved hostname: ${hostname}`);
      throw new Error(`Disallowed hostname: ${hostname}`);
    }
  }
}

export const fetchPageText = async (url: string): Promise<string> => {
  validateUrl(url);

  const response = await fetch(`${backend.url}/api/clarion-app/llm-client/page-text`, {
    method: "POST",
    credentials: 'include',
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch page text");
  }

  const data = await response.json();
  return data.text;
}