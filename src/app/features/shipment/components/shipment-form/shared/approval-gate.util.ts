// Pure helper deciding whether the current user may approve a pending approval step.
// Kept separate from components so it can be unit-tested without Angular's TestBed.

export interface ApprovalGateOptions {
  /** True for Admin/Management-level roles that can approve anything. */
  isAdmin?: boolean | null;
  /** True when the user holds the RBAC permission for this approval. */
  hasPermission?: boolean | null;
  /** Legacy role fallback (e.g. FAS Manager) kept for backward compatibility. */
  isLegacyApproverRole?: boolean | null;
}

/**
 * Point 3: the approval button shows only when the step is awaiting approval AND the
 * user is allowed — via admin, the granted RBAC permission, or the legacy approver role.
 */
export function canApprovePendingStep(
  status: string | null | undefined,
  pendingStatus: string,
  opts: ApprovalGateOptions
): boolean {
  if (status !== pendingStatus) return false;
  return !!(opts?.isAdmin || opts?.hasPermission || opts?.isLegacyApproverRole);
}
