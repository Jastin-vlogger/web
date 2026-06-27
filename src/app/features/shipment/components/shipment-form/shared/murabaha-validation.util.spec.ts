import { describe, expect, it } from 'vitest';
import { getMurabahaMissingFields } from './murabaha-validation.util';

describe('Point 5: Murabaha phase validation', () => {
  it('requires nothing when Skip Murabaha is Yes', () => {
    expect(getMurabahaMissingFields({ skipMurabaha: true })).toEqual([]);
    expect(
      getMurabahaMissingFields({ skipMurabaha: true, releasedDate: null, hasAttachment: false })
    ).toEqual([]);
  });

  it('requires both Released Date and Attachment when Skip Murabaha is No', () => {
    expect(
      getMurabahaMissingFields({ skipMurabaha: false, releasedDate: null, hasAttachment: false })
    ).toEqual(['Murabaha Released Date', 'Murabaha Contract Attached']);
  });

  it('flags only the missing field', () => {
    expect(
      getMurabahaMissingFields({ skipMurabaha: false, releasedDate: new Date(), hasAttachment: false })
    ).toEqual(['Murabaha Contract Attached']);
    expect(
      getMurabahaMissingFields({ skipMurabaha: false, releasedDate: null, hasAttachment: true })
    ).toEqual(['Murabaha Released Date']);
  });

  it('passes when both provided and not skipped', () => {
    expect(
      getMurabahaMissingFields({ skipMurabaha: false, releasedDate: '2026-06-04', hasAttachment: true })
    ).toEqual([]);
  });
});
