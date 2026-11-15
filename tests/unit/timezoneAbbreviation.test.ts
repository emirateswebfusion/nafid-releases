import { describe, it, expect } from 'vitest';
import {
  getTimezoneAbbreviation,
  getTimezoneOffsetMinutes,
  isDaylightSavingTime,
  formatUtcOffset,
  formatTimezoneOptionLabel,
} from '../../src/utils/time/timezoneFormatter';

describe('timezoneFormatter', () => {
  describe('validation requirements', () => {
    it('displays IST for Asia/Calcutta and Asia/Kolkata across seasons', () => {
      const winter = new Date('2026-01-15T12:00:00Z');
      const summer = new Date('2026-07-15T12:00:00Z');

      expect(getTimezoneAbbreviation('Asia/Calcutta', winter)).toBe('IST');
      expect(getTimezoneAbbreviation('Asia/Calcutta', summer)).toBe('IST');
      expect(getTimezoneAbbreviation('Asia/Kolkata', winter)).toBe('IST');
      expect(getTimezoneAbbreviation('Asia/Kolkata', summer)).toBe('IST');
    });

    it('displays GST for Asia/Dubai and Asia/Muscat', () => {
      const winter = new Date('2026-01-15T12:00:00Z');
      const summer = new Date('2026-07-15T12:00:00Z');

      expect(getTimezoneAbbreviation('Asia/Dubai', winter)).toBe('GST');
      expect(getTimezoneAbbreviation('Asia/Dubai', summer)).toBe('GST');
      expect(getTimezoneAbbreviation('Asia/Muscat', winter)).toBe('GST');
      expect(getTimezoneAbbreviation('Asia/Muscat', summer)).toBe('GST');
    });

    it('correctly switches between EST and EDT for America/New_York', () => {
      const winterDate = new Date('2026-01-15T12:00:00Z'); // January = EST
      const summerDate = new Date('2026-07-15T12:00:00Z'); // July = EDT

      expect(isDaylightSavingTime(winterDate, 'America/New_York')).toBe(false);
      expect(isDaylightSavingTime(summerDate, 'America/New_York')).toBe(true);

      expect(getTimezoneAbbreviation('America/New_York', winterDate)).toBe('EST');
      expect(getTimezoneAbbreviation('America/New_York', summerDate)).toBe('EDT');
    });

    it('correctly switches between GMT and BST for Europe/London', () => {
      const winterDate = new Date('2026-01-15T12:00:00Z'); // January = GMT
      const summerDate = new Date('2026-07-15T12:00:00Z'); // July = BST

      expect(isDaylightSavingTime(winterDate, 'Europe/London')).toBe(false);
      expect(isDaylightSavingTime(summerDate, 'Europe/London')).toBe(true);

      expect(getTimezoneAbbreviation('Europe/London', winterDate)).toBe('GMT');
      expect(getTimezoneAbbreviation('Europe/London', summerDate)).toBe('BST');
    });

    it('correctly switches between AEST and AEDT for Australia/Sydney', () => {
      const australianSummer = new Date('2026-01-15T12:00:00Z'); // January = AEDT (Daylight Saving)
      const australianWinter = new Date('2026-07-15T12:00:00Z'); // July = AEST (Standard Time)

      expect(isDaylightSavingTime(australianSummer, 'Australia/Sydney')).toBe(true);
      expect(isDaylightSavingTime(australianWinter, 'Australia/Sydney')).toBe(false);

      expect(getTimezoneAbbreviation('Australia/Sydney', australianSummer)).toBe('AEDT');
      expect(getTimezoneAbbreviation('Australia/Sydney', australianWinter)).toBe('AEST');
    });

    it('displays JST for Asia/Tokyo and SGT for Asia/Singapore', () => {
      expect(getTimezoneAbbreviation('Asia/Tokyo')).toBe('JST');
      expect(getTimezoneAbbreviation('Asia/Singapore')).toBe('SGT');
    });
  });

  describe('Gulf & Middle East regions', () => {
    it('displays AST for Saudi Arabia, Qatar, Kuwait, Bahrain', () => {
      expect(getTimezoneAbbreviation('Asia/Riyadh')).toBe('AST');
      expect(getTimezoneAbbreviation('Asia/Qatar')).toBe('AST');
      expect(getTimezoneAbbreviation('Asia/Kuwait')).toBe('AST');
      expect(getTimezoneAbbreviation('Asia/Bahrain')).toBe('AST');
    });
  });

  describe('DST detection and offset calculation', () => {
    it('calculates wall-clock offset in minutes accurately', () => {
      const utcInstant = new Date('2026-01-15T12:00:00Z');
      expect(getTimezoneOffsetMinutes(utcInstant, 'Asia/Kolkata')).toBe(330);
      expect(getTimezoneOffsetMinutes(utcInstant, 'Asia/Dubai')).toBe(240);
      expect(getTimezoneOffsetMinutes(utcInstant, 'America/New_York')).toBe(-300);
      expect(getTimezoneOffsetMinutes(utcInstant, 'Europe/London')).toBe(0);
      expect(getTimezoneOffsetMinutes(utcInstant, 'Asia/Tokyo')).toBe(540);
    });

    it('formats UTC offsets into standard labels', () => {
      expect(formatUtcOffset(330)).toBe('UTC+05:30');
      expect(formatUtcOffset(240)).toBe('UTC+04:00');
      expect(formatUtcOffset(-300)).toBe('UTC-05:00');
      expect(formatUtcOffset(0)).toBe('UTC+00:00');
    });
  });

  describe('edge cases and fallbacks', () => {
    it('falls back to clear UTC offset for unmapped or ambiguous timezones', () => {
      const d = new Date('2026-01-15T12:00:00Z');
      // Pacific/Marquesas is UTC-09:30, unmapped
      const abbr = getTimezoneAbbreviation('Pacific/Marquesas', d);
      expect(abbr).toBe('UTC-09:30');
    });

    it('handles empty, null, or invalid timezone gracefully', () => {
      expect(getTimezoneAbbreviation('')).toBe('UTC');
      expect(getTimezoneAbbreviation(null)).toBe('UTC');
      expect(getTimezoneAbbreviation(undefined)).toBe('UTC');
    });

    it('formats option label for dropdowns', () => {
      const label = formatTimezoneOptionLabel('Asia/Tokyo', 'Japan');
      expect(label).toContain('Japan');
      expect(label).toContain('JST');
      expect(label).toContain('UTC+09:00');
    });
  });
});
