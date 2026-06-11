import { describe, expect, it } from 'vitest';
import {
  getActiveDocumentMilestones,
  isDocumentationCompleteForCurrentFlow,
  isDocumentationMilestoneComplete,
} from './document-tracker-milestones';

describe('document tracker milestone flow', () => {
  it('uses milestone 4 as the Bank receiver completion point', () => {
    expect(getActiveDocumentMilestones(true)).toEqual([
      'courier',
      'receiving',
      'inward',
      'murabaha_process',
    ]);

    const bankActual = {
      courierTrackNo: '3540505791',
      courierServiceProvider: 'DHL',
      docArrivalNotes: 'Arrived',
      receiver: 'Bank',
      bankName: 'ADIB',
      expectedDocDate: '2026-05-25',
      inwardCollectionAdviceDate: '2026-05-24',
      inwardCollectionAdviceDocumentUrl: 's3://advice.pdf',
      murabahaContractApprovedDate: '2026-06-04',
    };

    expect(isDocumentationCompleteForCurrentFlow(bankActual)).toBe(true);
    expect(isDocumentationCompleteForCurrentFlow({
      ...bankActual,
      murabahaContractApprovedDate: '',
    })).toBe(false);
  });

  it('uses milestone 2 as the Direct receiver completion point', () => {
    expect(getActiveDocumentMilestones(false)).toEqual(['courier', 'receiving']);

    expect(isDocumentationCompleteForCurrentFlow({
      courierTrackNo: 'DHL-1',
      courierServiceProvider: 'DHL',
      receiver: 'Direct',
      expectedDocDate: '2026-05-25',
    })).toBe(true);
  });

  it('does not include paused milestones 5 and 6 in completion', () => {
    expect(isDocumentationMilestoneComplete({
      murabahaContractSubmittedDate: '2026-06-05',
    }, 'murabaha_submit')).toBe(false);
    expect(isDocumentationMilestoneComplete({
      documentsReleasedDate: '2026-06-06',
    }, 'release')).toBe(false);
  });
});
