/**
 * Privacy gate for everything Clippy observes. Window titles can contain
 * sensitive things (passwords, banking, private/incognito browsing), so we
 * detect those and (a) never feed them to the model and (b) never persist them.
 * Everything here runs on-device; nothing is ever transmitted.
 */

// Titles that should never be read into context OR written to memory.
const SENSITIVE_TITLE =
  /password|passwd|1password|bitwarden|lastpass|dashlane|keychain|bank|chase|wells\s*fargo|citibank|paypal|venmo|coinbase|robinhood|credit\s*card|\bssn\b|social security|\botp\b|two[\s-]?factor|authenticat|recovery|seed phrase|wallet|\bvisa\b|mastercard/i;

// Signals that a browser window is in a private/incognito session. We treat
// these as off-limits entirely — Clippy doesn't watch what you do in private.
const INCOGNITO =
  /incognito|inprivate|private browsing|private window|\(private\)/i;

/** Is this window title sensitive (and therefore off-limits)? */
export function isSensitiveTitle(title?: string): boolean {
  const t = (title || "").trim();
  if (!t) return false;
  return SENSITIVE_TITLE.test(t) || INCOGNITO.test(t);
}

/** Is the user in a private/incognito browsing window? */
export function isIncognito(title?: string): boolean {
  return INCOGNITO.test((title || "").trim());
}

/**
 * Clean a window title for use in context: returns undefined for sensitive or
 * empty titles (so Clippy falls back to the app name), and caps length so a
 * giant title can't bloat the prompt.
 */
export function sanitizeTitle(title?: string): string | undefined {
  const t = (title || "").trim();
  if (!t || isSensitiveTitle(t)) {
    return undefined;
  }
  return t.length > 120 ? t.slice(0, 120) : t;
}
