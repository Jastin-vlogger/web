import { describe, expect, it } from 'vitest';
import { canApprovePendingStep } from './approval-gate.util';

describe('Point 3: approval gate', () => {
  const P = 'pending_fas_manager';

  it('hides the button when status is not the pending status', () => {
    expect(canApprovePendingStep('approved', P, { isAdmin: true })).toBe(false);
    expect(canApprovePendingStep('draft', P, { hasPermission: true })).toBe(false);
  });

  it('shows for a user granted the RBAC permission (FAS with toggle on)', () => {
    expect(
      canApprovePendingStep(P, P, { isAdmin: false, hasPermission: true, isLegacyApproverRole: false })
    ).toBe(true);
  });

  it('shows for admin even without the explicit permission', () => {
    expect(canApprovePendingStep(P, P, { isAdmin: true, hasPermission: false })).toBe(true);
  });

  it('shows for the legacy approver role (FAS Manager) for backward compatibility', () => {
    expect(
      canApprovePendingStep(P, P, { isAdmin: false, hasPermission: false, isLegacyApproverRole: true })
    ).toBe(true);
  });

  it('hides when pending but the user has no approval rights', () => {
    expect(
      canApprovePendingStep(P, P, { isAdmin: false, hasPermission: false, isLegacyApproverRole: false })
    ).toBe(false);
  });
});
