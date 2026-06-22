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
  inward: 'Inward Collection Advice',
  murabaha_process: 'Murabaha Contract Phase',
  murabaha_submit: 'Contract Submission',
  release: 'Final Documents Release',
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
  murabahaContractReleasedDate?: unknown;
  murabahaContractApprovedDate?: unknown;
  murabahaContractSubmittedDate?: unknown;
  murabahaContractSubmittedDocumentUrl?: unknown;
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
      return isBankReceiverValue(values.receiver) ? hasValue(values.bankName) : true;
    }
    case 'inward':
      return hasValue(values.inwardCollectionAdviceDate) ||
        hasValue(values.inwardCollectionAdviceReceivedAt) ||
        hasValue(values.inwardCollectionAdviceSubmittedAt) ||
        hasValue(values.inwardCollectionAdviceDocumentUrl);
    case 'murabaha_process':
      return hasValue(values.murabahaContractReleasedDate) || hasValue(values.murabahaContractApprovedDate);
    case 'murabaha_submit':
      return hasValue(values.murabahaContractSubmittedDate) || hasValue(values.murabahaContractSubmittedDocumentUrl);
    case 'release':
      return hasValue(values.documentsReleasedDate) || hasValue(values.documentsReleasedDocumentUrl);
  }
};

export const isDocumentationCompleteForCurrentFlow = (values: DocumentationCompletionValues): boolean =>
  getActiveDocumentMilestones(isBankReceiverValue(values.receiver)).every((milestone) =>
    isDocumentationMilestoneComplete(values, milestone)
  );
