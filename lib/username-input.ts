import { stripAtHandle } from "@/lib/username-display";

export const USERNAME_SPACE_ERROR =
  "Username cannot contain spaces - use underscores instead";

const ALLOWED = /^[a-z0-9_-]*$/;

/** Normalize for storage: lowercase, spaces → underscores, strip invalid chars, strip leading @. */
export function normalizeUsernameForStorage(raw: string): string {
  const base = stripAtHandle(raw).toLowerCase().replace(/\s+/g, "_");
  return base.replace(/[^a-z0-9_-]/g, "");
}

/**
 * While typing: lowercase, spaces become underscores, drop disallowed characters.
 * Returns whether any space was present in the raw input (for error messaging).
 */
export function sanitizeUsernameLiveInput(raw: string): {
  value: string;
  hadSpace: boolean;
} {
  const hadSpace = raw.includes(" ");
  const base = stripAtHandle(raw).toLowerCase().replace(/\s+/g, "_");
  let value = "";
  for (const ch of base) {
    if (/[a-z0-9_-]/.test(ch)) value += ch;
  }
  return { value, hadSpace };
}

/** Creator / display name: same character rules, keep @ prefix in display separately. */
export function sanitizeCreatorNameLiveInput(raw: string): {
  value: string;
  hadSpace: boolean;
} {
  const hadSpace = raw.includes(" ");
  const withAt = raw.startsWith("@") ? `@${raw.slice(1)}` : raw;
  const rest = withAt.startsWith("@") ? withAt.slice(1) : withAt;
  let body = "";
  for (const ch of rest.toLowerCase()) {
    if (ch === " " || ch === "_") {
      body += "_";
      continue;
    }
    if (/[a-z0-9-]/.test(ch)) body += ch;
  }
  body = body.replace(/_+/g, "_").replace(/^-+|-+$/g, "");
  const value = withAt.startsWith("@") ? `@${body}` : body;
  return { value, hadSpace };
}

export function normalizeCreatorNameForStorage(raw: string): string {
  const s = sanitizeCreatorNameLiveInput(raw).value;
  return stripAtHandle(s).replace(/_+/g, "_").replace(/^-+|-+$/g, "");
}

export function isValidUsernameNormalized(normalized: string): boolean {
  return normalized.length >= 2 && normalized.length <= 32 && ALLOWED.test(normalized);
}
