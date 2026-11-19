export const SUPPORTED_CURRENCIES = [
  { code: 'EGP', label: 'جنيه مصري (EGP)' },
  { code: 'SAR', label: 'ريال سعودي (SAR)' },
  { code: 'AED', label: 'درهم إماراتي (AED)' },
  { code: 'KWD', label: 'دينار كويتي (KWD)' },
  { code: 'QAR', label: 'ريال قطري (QAR)' },
  { code: 'BHD', label: 'دينار بحريني (BHD)' },
  { code: 'OMR', label: 'ريال عماني (OMR)' },
  { code: 'JOD', label: 'دينار أردني (JOD)' },
  { code: 'USD', label: 'دولار أمريكي (USD)' },
  { code: 'EUR', label: 'يورو (EUR)' },
  { code: 'GBP', label: 'جنيه إسترليني (GBP)' },
  { code: 'TRY', label: 'ليرة تركية (TRY)' },
  { code: 'CAD', label: 'دولار كندي (CAD)' },
  { code: 'AUD', label: 'دولار أسترالي (AUD)' },
  { code: 'CHF', label: 'فرنك سويسري (CHF)' },
  { code: 'INR', label: 'روبية هندية (INR)' },
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]['code'];

const SUPPORTED_CURRENCY_CODES: ReadonlySet<string> = new Set(
  SUPPORTED_CURRENCIES.map(({ code }) => code)
);

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return typeof value === 'string' && SUPPORTED_CURRENCY_CODES.has(value);
}
