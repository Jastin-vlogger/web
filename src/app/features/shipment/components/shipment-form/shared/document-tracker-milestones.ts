export type DocumentMilestoneKey =
  | 'courier'
  | 'receiving'
  | 'inward'
  | 'murabaha_process'
  | 'murabaha_submit'
  | 'release';

export const PAUSED_DOCUMENT_MILESTONES: readonly DocumentMilestoneKey[] = [];

export const BANK_DOCUMENT_MILESTONES: readonly DocumentMilestoneKey[] = [
  'courier',
  'receiving',
  'inward',
  'murabaha_process',
  'murabaha_submit',
  'release',
];

export const DIRECT_DOCUMENT_MILESTONES: readonly DocumentMilestoneKey[] = [
  'courier',
  'receiving',
];

export const DOCUMENT_MILESTONE_LABELS: Record<DocumentMilestoneKey, string> = {
  courier: 'Courier Logistics',
  receiving: 'Receiver & Bank Setup',
  inward: 'DA Upload & Bank Submission Status',
  murabaha_process: 'Murabaha Contract Phase',
  murabaha_submit: 'Bank Submission',
  release: 'Final Contract Received From Bank',
};

export const isPausedDocumentMilestone = (milestone: string): milestone is DocumentMilestoneKey =>
  PAUSED_DOCUMENT_MILESTONES.includes(milestone as DocumentMilestoneKey);

export const getActiveDocumentMilestones = (isBankReceiver: boolean): readonly DocumentMilestoneKey[] =>
  isBankReceiver ? BANK_DOCUMENT_MILESTONES : DIRECT_DOCUMENT_MILESTONES;

export type DocumentationCompletionValues = {
  courierTrackNo?: unknown;
  courierServiceProvider?: unknown;
  docArrivalNotes?: unknown;
  expectedDocDate?: unknown;
  receiver?: unknown;
  bankName?: unknown;
  inwardCollectionAdviceDate?: unknown;
  inwardCollectionAdviceReceivedAt?: unknown;
  inwardCollectionAdviceSubmittedAt?: unknown;
  inwardCollectionAdviceDocumentUrl?: unknown;
  bankSubmittedToBank?: unknown;
  daSignedDocumentUrl?: unknown;
  dnSignedDocumentUrl?: unknown;
  skipMurabaha?: unknown;
  murabahaContractReleasedDate?: unknown;
  murabahaContractApprovedDate?: unknown;
  murabahaContractDocumentUrl?: unknown;
  murabahaContractSubmittedDate?: unknown;
  murabahaContractSubmittedDocumentUrl?: unknown;
  daSubmittedToBank?: unknown;
  murabahaSubmittedToBank?: unknown;
  submissionPackageDocumentUrl?: unknown;
  documentsReleasedDate?: unknown;
  documentsReleasedDocumentUrl?: unknown;
};

const hasValue = (value: unknown): boolean => String(value ?? '').trim().length > 0;

export const isBankReceiverValue = (receiver: unknown): boolean => {
  const raw =
    typeof receiver === 'string'
      ? receiver
      : typeof (receiver as { value?: unknown })?.value === 'string'
        ? (receiver as { value: string }).value
        : typeof (receiver as { label?: unknown })?.label === 'string'
          ? (receiver as { label: string }).label
          : '';
  return raw.trim().toLowerCase() === 'bank';
};

export const isDocumentationMilestoneComplete = (
  values: DocumentationCompletionValues,
  milestone: DocumentMilestoneKey,
): boolean => {
  switch (milestone) {
    case 'courier':
      return hasValue(values.courierTrackNo) || hasValue(values.courierServiceProvider) || hasValue(values.docArrivalNotes);
    case 'receiving': {
      const hasReceiver = hasValue(values.receiver);
      if (!hasReceiver || !hasValue(values.expectedDocDate)) return false;
      if (isBankReceiverValue(values.receiver)) {
        // DA document upload is no longer required just to reveal Milestone 2 — it can be
        // attached from within Milestone 2 itself once it's visible.
        return hasValue(values.bankName);
      }
      return true;
    }
    case 'inward':
      return hasValue(values.inwardCollectionAdviceSubmittedAt) ||
        hasValue(values.daSignedDocumentUrl) ||
        values.bankSubmittedToBank === true ||
        values.bankSubmittedToBank === false;
    case 'murabaha_process':
      if (values.skipMurabaha === true || values.skipMurabaha === 'true') return true;
      return hasValue(values.murabahaContractReleasedDate) || hasValue(values.murabahaContractDocumentUrl);
    case 'murabaha_submit':
      return hasValue(values.murabahaContractSubmittedDate) || hasValue(values.submissionPackageDocumentUrl);
    case 'release':
      return hasValue(values.documentsReleasedDate) || hasValue(values.documentsReleasedDocumentUrl);
  }
};

export const isDocumentationCompleteForCurrentFlow = (values: DocumentationCompletionValues): boolean =>
  getActiveDocumentMilestones(isBankReceiverValue(values.receiver)).every((milestone) =>
    isDocumentationMilestoneComplete(values, milestone)
  );
