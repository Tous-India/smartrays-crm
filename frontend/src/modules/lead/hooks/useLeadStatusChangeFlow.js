import { useState } from "react";
import { changeLeadStatus, convertLeadToCustomer } from "../api/leadApi";

/**
 * Centralizes the two status changes that need an extra step before the API
 * call can be made, so the Table's status dropdown, the Board's drag-and-
 * drop, and the Detail page's action buttons all get the exact same
 * behavior instead of three separate implementations:
 *
 * - `lost` requires `lostReason` (backend 400s without it) — collected via
 *   `LostReasonModal` BEFORE the call, never after a drag/click already
 *   looked like it succeeded.
 * - `won` triggers the Convert-to-Customer flow (leads-customer-functional-
 *   spec.md) rather than a plain status change — `ConvertToCustomerModal`
 *   collects the required `projectManagerId`, then this hook calls the real
 *   convert endpoint followed by the actual status change to `won`.
 *
 * Every other status transition changes immediately with no modal.
 */
export function useLeadStatusChangeFlow({ onChanged }) {
  const [lostTarget, setLostTarget] = useState(null);
  const [wonTarget, setWonTarget] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function requestStatusChange(lead, newStatus) {
    if (newStatus === "lost") {
      setLostTarget(lead);
      return;
    }

    if (newStatus === "won") {
      setWonTarget(lead);
      return;
    }

    changeLeadStatus(lead._id, { status: newStatus }).then(onChanged);
  }

  async function confirmLost(lostReason) {
    setIsSubmitting(true);

    try {
      await changeLeadStatus(lostTarget._id, { status: "lost", lostReason });
      setLostTarget(null);
      onChanged();
    } finally {
      setIsSubmitting(false);
    }
  }

  function cancelLost() {
    setLostTarget(null);
  }

  async function confirmWon(convertPayload) {
    setIsSubmitting(true);

    try {
      const response = await convertLeadToCustomer(wonTarget._id, convertPayload);
      await changeLeadStatus(wonTarget._id, { status: "won" });
      setWonTarget(null);
      onChanged();
      return response.data.data;
    } finally {
      setIsSubmitting(false);
    }
  }

  function cancelWon() {
    setWonTarget(null);
  }

  return {
    lostTarget,
    wonTarget,
    isSubmitting,
    requestStatusChange,
    confirmLost,
    cancelLost,
    confirmWon,
    cancelWon,
  };
}

export default useLeadStatusChangeFlow;
