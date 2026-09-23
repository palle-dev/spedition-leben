// Befehls-Handler für Führung & Delegation.
// Aus simulationEngine.ts extrahiert, um die Dateigröße zu reduzieren.

import {
  migrateDelegation, migrateApprovals, getDelegationSummary,
  applyPreset, updateRule, clearBranchOverride,
  approveApproval, rejectApproval, deleteApproval, expireApprovals,
  PRESETS,
} from "./delegationEngine.ts";
import { executeApprovedAction } from "./approvalActions.ts";

export function handleDelegationCommand(state, command, p) {
  switch (command) {
    case "getDelegationSummary": {
      return { ok: true, ...getDelegationSummary(state) };
    }

    case "applyDelegationPreset": {
      return applyPreset(state, p.presetId);
    }

    case "updateDelegationRule": {
      return updateRule(state, p.key, p.value, p.branchId || null);
    }

    case "clearBranchOverride": {
      return clearBranchOverride(state, p.branchId);
    }

    case "approveApproval": {
      return approveApproval(state, p.requestId, req => executeApprovedAction(state, req));
    }

    case "rejectApproval": {
      return rejectApproval(state, p.requestId);
    }

    case "deleteApproval": {
      return deleteApproval(state, p.requestId);
    }

    case "expireApprovals": {
      const expired = expireApprovals(state);
      return { ok: true, expired };
    }

    case "getApprovalPresets": {
      return { ok: true, presets: PRESETS };
    }

    default:
      return null;
  }
}