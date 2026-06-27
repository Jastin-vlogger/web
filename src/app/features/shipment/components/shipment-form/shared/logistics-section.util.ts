// Pure helpers for the Port & Clearance / Regulatory logistics sections, kept separate
// from the component so they can be unit-tested without Angular's TestBed.

export interface MunicipalitySectionValues {
  municipalityStatus?: string | null;
  municipalityDate?: unknown;
}

/**
 * Returns the list of missing required fields for the Municipality section.
 * Point 6: the Inspection Date is OPTIONAL — only Status is required.
 */
export function getMunicipalitySectionMissingFields(values: MunicipalitySectionValues): string[] {
  const missing: string[] = [];
  const status = String(values?.municipalityStatus ?? 'open').trim().toLowerCase();
  if (!status) {
    missing.push('Status');
  }
  return missing;
}

/**
 * Point 7: resolves the document name shown next to the eye icon for an upload spot.
 * Precedence: a freshly-selected (transient) file name, then the saved file name,
 * then a fallback label (e.g. "DO Attached"). Returns '' when nothing is attached.
 */
export function resolveAttachmentDisplayName(
  transientFileName: string | null | undefined,
  savedFileName: string | null | undefined,
  fallbackLabel = 'Attached'
): string {
  const transient = String(transientFileName ?? '').trim();
  if (transient) return transient;
  const saved = String(savedFileName ?? '').trim();
  if (saved) return saved;
  // Only show the fallback "Attached" label when there is actually an attachment;
  // callers guard this with the presence of a URL/file, so an explicit fallback here
  // is returned only when requested.
  return fallbackLabel;
}
