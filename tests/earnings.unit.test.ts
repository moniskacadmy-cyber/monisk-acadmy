import { describe, expect, it } from 'vitest';
import { calcSessionAmount, formatDuration, isValidHourlyRate, splitAmongStudents } from '../src/shared/earnings';

describe('earnings math', () => {
  it('amount = rate × duration in hours', () => {
    expect(calcSessionAmount(100, 90)).toBe(150);
    expect(calcSessionAmount(120, 45)).toBe(90);
    expect(calcSessionAmount(100, 60)).toBe(100);
  });

  it('rounds to two decimals', () => {
    expect(calcSessionAmount(100, 20)).toBe(33.33);
  });

  it('no rate or zero duration means zero amount', () => {
    expect(calcSessionAmount(null, 60)).toBe(0);
    expect(calcSessionAmount(0, 60)).toBe(0);
    expect(calcSessionAmount(100, 0)).toBe(0);
  });

  it('splits equally among attended students and returns nothing for nobody', () => {
    expect(splitAmongStudents(150, ['a', 'b'])).toEqual({ a: 75, b: 75 });
    expect(splitAmongStudents(150, [])).toEqual({});
  });

  it('formats minutes as h:mm', () => {
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(45)).toBe('0:45');
    expect(formatDuration(0)).toBe('0:00');
  });

  it('validates hourly rates', () => {
    expect(isValidHourlyRate(0)).toBe(true);
    expect(isValidHourlyRate(250.5)).toBe(true);
    expect(isValidHourlyRate(-1)).toBe(false);
    expect(isValidHourlyRate(NaN)).toBe(false);
    expect(isValidHourlyRate('100')).toBe(false);
  });
});
