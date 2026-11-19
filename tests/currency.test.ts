import { describe, expect, it } from 'vitest';
import { isSupportedCurrency, SUPPORTED_CURRENCIES } from '../src/shared/currency';

describe('Supported currencies', () => {
  it('includes common currencies used across the supported regions', () => {
    expect(isSupportedCurrency('EGP')).toBe(true);
    expect(isSupportedCurrency('SAR')).toBe(true);
    expect(isSupportedCurrency('AED')).toBe(true);
    expect(isSupportedCurrency('USD')).toBe(true);
    expect(isSupportedCurrency('EUR')).toBe(true);
    expect(SUPPORTED_CURRENCIES.length).toBeGreaterThanOrEqual(15);
  });

  it('rejects unknown, malformed, or non-string currency values', () => {
    expect(isSupportedCurrency('BTC')).toBe(false);
    expect(isSupportedCurrency('egp')).toBe(false);
    expect(isSupportedCurrency('')).toBe(false);
    expect(isSupportedCurrency(undefined)).toBe(false);
    expect(isSupportedCurrency(123)).toBe(false);
  });
});
