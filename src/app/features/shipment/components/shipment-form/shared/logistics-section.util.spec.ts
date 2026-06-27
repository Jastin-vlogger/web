import { describe, expect, it } from 'vitest';
import {
  getMunicipalitySectionMissingFields,
  resolveAttachmentDisplayName,
} from './logistics-section.util';

describe('Point 6: municipality section validation', () => {
  it('passes (no missing fields) when Inspection Date is empty but Status is set', () => {
    expect(
      getMunicipalitySectionMissingFields({ municipalityStatus: 'open', municipalityDate: null })
    ).toEqual([]);
  });

  it('passes with a default open status even when date is missing', () => {
    expect(getMunicipalitySectionMissingFields({})).toEqual([]);
  });

  it('flags Status only when it is explicitly blank', () => {
    expect(
      getMunicipalitySectionMissingFields({ municipalityStatus: '', municipalityDate: null })
    ).toEqual(['Status']);
  });

  it('never requires the Inspection Date', () => {
    const missing = getMunicipalitySectionMissingFields({ municipalityStatus: 'closed' });
    expect(missing).not.toContain('Municipality Clearance Application Date');
    expect(missing).not.toContain('Municipality Inspection Date');
  });
});

describe('Point 7: attachment display name resolution', () => {
  it('prefers a freshly-selected file name', () => {
    expect(resolveAttachmentDisplayName('new.pdf', 'old.pdf', 'DO Attached')).toBe('new.pdf');
  });

  it('falls back to the saved file name when no transient file', () => {
    expect(resolveAttachmentDisplayName(null, 'saved.pdf', 'DO Attached')).toBe('saved.pdf');
  });

  it('uses the fallback label when neither name is present', () => {
    expect(resolveAttachmentDisplayName(null, null, 'DO Attached')).toBe('DO Attached');
    expect(resolveAttachmentDisplayName('', '', 'BOE Attached')).toBe('BOE Attached');
  });

  it('trims whitespace-only names', () => {
    expect(resolveAttachmentDisplayName('   ', 'saved.pdf', 'x')).toBe('saved.pdf');
  });
});
