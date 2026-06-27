// Pure validation helper for the Murabaha Contract Phase, kept separate from the
// documentation component so it can be unit-tested without Angular's TestBed.

export interface MurabahaValidationInput {
  /** Whether "Skip Murabaha" is toggled on. When true, no fields are required. */
  skipMurabaha?: boolean | null;
  /** The Murabaha Released Date value (any truthy value counts as provided). */
  releasedDate?: unknown;
  /** Whether a Murabaha contract document is attached (new file or already saved). */
  hasAttachment?: boolean | null;
}

/**
 * Point 5: returns the list of missing required fields for the Murabaha phase.
 * - Skip Murabaha = Yes  -> nothing required (fields are treated as N/A).
 * - Skip Murabaha = No   -> Murabaha Released Date AND Contract attachment are mandatory.
 */
export function getMurabahaMissingFields(input: MurabahaValidationInput): string[] {
  if (input?.skipMurabaha === true) {
    return [];
  }
  const missing: string[] = [];
  if (!input?.releasedDate) {
    missing.push('Murabaha Released Date');
  }
  if (!input?.hasAttachment) {
    missing.push('Murabaha Contract Attached');
  }
  return missing;
}
