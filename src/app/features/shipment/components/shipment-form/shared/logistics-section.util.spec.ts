import { describe, expect, it } from 'vitest';
import {
  getMunicipalitySectionMissingFields,
  resolveAttachmentDisplayName,
} from './logistics-section.util';

describe('municipality section validation', () => {
  it('passes (no missing fields) when not applicable and Status is set', () => {
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

  it('does not require the Inspection Date when Applicable is not Yes', () => {
    const missing = getMunicipalitySectionMissingFields({ municipalityStatus: 'closed', municipalityReleasedDate: new Date() });
    expect(missing).not.toContain('Municipality Inspection Date');
  });

  it('requires Inspection Date once Municipality Applicable is Yes', () => {
    const missing = getMunicipalitySectionMissingFields({ municipalityApplicable: true, municipalityStatus: 'open', municipalityDate: null });
    expect(missing).toContain('Municipality Inspection Date');
  });

  it('does not require Inspection Date when Applicable is Yes and it is provided', () => {
    const missing = getMunicipalitySectionMissingFields({ municipalityApplicable: true, municipalityStatus: 'open', municipalityDate: new Date() });
    expect(missing).not.toContain('Municipality Inspection Date');
  });

  it('requires Released Date once Status is Closed', () => {
    const missing = getMunicipalitySectionMissingFields({ municipalityStatus: 'closed', municipalityReleasedDate: null });
    expect(missing).toContain('Municipality Released Date');
  });

  it('does not require Released Date when Status is Closed and it is provided', () => {
    const missing = getMunicipalitySectionMissingFields({ municipalityStatus: 'closed', municipalityReleasedDate: new Date() });
    expect(missing).not.toContain('Municipality Released Date');
  });

  it('does not require Released Date while Status is Open', () => {
    const missing = getMunicipalitySectionMissingFields({ municipalityStatus: 'open', municipalityReleasedDate: null });
    expect(missing).not.toContain('Municipality Released Date');
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
