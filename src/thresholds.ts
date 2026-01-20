// Threshold constants (in bytes)
export const THRESHOLDS = {
  SAFE: 300 * 1024 * 1024,      // 300 MB
  CAUTION: 450 * 1024 * 1024,   // 450 MB  
  DANGER: 480 * 1024 * 1024     // 480 MB
} as const;

// Indicator emojis
export const INDICATORS = {
  SAFE: '✅',
  CAUTION: '⚠️',
  DANGER: '❌',
  UNKNOWN: '❓'
} as const;

/**
 * Get visual indicator based on file size
 */
export function getIndicator(sizeBytes: number): string {
  if (sizeBytes < 0) return INDICATORS.UNKNOWN;
  if (sizeBytes < THRESHOLDS.SAFE) return INDICATORS.SAFE;
  if (sizeBytes < THRESHOLDS.CAUTION) return INDICATORS.CAUTION;
  return INDICATORS.DANGER;
}

/**
 * Format bytes to human-readable MB
 */
export function formatSizeMB(sizeBytes: number): string {
  if (sizeBytes < 0) return '?';
  const mb = sizeBytes / (1024 * 1024);
  return mb.toFixed(0);
}

/**
 * Get tooltip text based on size
 */
export function getTooltip(sizeBytes: number): string {
  const mb = formatSizeMB(sizeBytes);
  if (sizeBytes < THRESHOLDS.SAFE) {
    return `Copilot Chat: ${mb} MB - Safe to continue`;
  }
  if (sizeBytes < THRESHOLDS.CAUTION) {
    return `Copilot Chat: ${mb} MB - Consider exporting soon`;
  }
  return `Copilot Chat: ${mb} MB - EXPORT NOW to avoid data loss!`;
}
