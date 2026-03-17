/**
 * Normalize Indian phone numbers to 91XXXXXXXXXX format
 * Also handles international numbers by stripping leading +
 */
function normalizePhone(raw) {
  if (!raw) return null;

  // Remove all non-digit characters except leading +
  let cleaned = String(raw).trim();
  const hasPlus = cleaned.startsWith('+');
  cleaned = cleaned.replace(/\D/g, '');

  if (!cleaned) return null;

  // Indian number normalization
  // If starts with 91 and total length is 12 -> already normalized
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return cleaned;
  }

  // If 10 digits and starts with 6-9 -> Indian mobile
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    return '91' + cleaned;
  }

  // If starts with 0 and rest is 10 digits -> Indian with leading 0
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    const rest = cleaned.slice(1);
    if (/^[6-9]/.test(rest)) {
      return '91' + rest;
    }
  }

  // International: had + prefix or is a long number
  if (hasPlus || cleaned.length > 10) {
    return cleaned;
  }

  // Fallback: return as-is
  return cleaned;
}

/**
 * Validate phone is plausible (7-15 digits)
 */
function isValidPhone(normalized) {
  if (!normalized) return false;
  return /^\d{7,15}$/.test(normalized);
}

module.exports = { normalizePhone, isValidPhone };
