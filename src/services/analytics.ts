export type AnalyticsParamValue = string | number | boolean;
export type AnalyticsParams = Record<string, AnalyticsParamValue | undefined | null>;

function sanitizeParams(params: AnalyticsParams): Record<string, AnalyticsParamValue> {
  const next: Record<string, AnalyticsParamValue> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    next[key] = value;
  }
  return next;
}

export function trackEvent(eventName: string, params: AnalyticsParams = {}): void {
  if (typeof window === 'undefined') {
    return;
  }

  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag !== 'function') {
    return;
  }

  gtag('event', eventName, sanitizeParams(params));
}
