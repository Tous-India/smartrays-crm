import ApiError from "../../utils/ApiError.js";

export function validateCreatePaymentInput(req, res, next) {
  const { customerId, manualClientName, invoiceId, date, amount } = req.body;

  const hasCustomerId = Boolean(customerId);
  const hasManualClientName = Boolean(manualClientName && manualClientName.trim());

  if (hasCustomerId === hasManualClientName) {
    throw new ApiError(400, "Provide exactly one of customerId or manualClientName");
  }

  if (invoiceId && !hasCustomerId) {
    throw new ApiError(400, "invoiceId can only be provided alongside a customerId");
  }

  if (!date || Number.isNaN(Date.parse(date))) {
    throw new ApiError(400, "A valid date is required");
  }

  if (typeof amount !== "number" || amount <= 0) {
    throw new ApiError(400, "amount must be a positive number");
  }

  next();
}

/**
 * `PATCH /payments/:id` — a partial update (any of amount/date/notes/
 * collectedBy, all optional), but `reason` is always required regardless of
 * what's being changed. `amount`/`date`, if present, are validated the same
 * way `validateCreatePaymentInput` validates them above.
 */
export function validateUpdatePaymentInput(req, res, next) {
  const { reason, amount, date } = req.body;

  if (!reason || !reason.trim()) {
    throw new ApiError(400, "A reason is required to edit a payment");
  }

  if (amount !== undefined && (typeof amount !== "number" || amount <= 0)) {
    throw new ApiError(400, "amount must be a positive number");
  }

  if (date !== undefined && Number.isNaN(Date.parse(date))) {
    throw new ApiError(400, "A valid date is required");
  }

  next();
}

/**
 * `DELETE /payments/:id` — `reason` is sent in the request body (not a
 * query param), the same shape as the edit reason above, so both "why did
 * this change" fields are handled identically front-to-back.
 */
export function validateDeletePaymentInput(req, res, next) {
  const { reason } = req.body;

  if (!reason || !reason.trim()) {
    throw new ApiError(400, "A reason is required to delete a payment");
  }

  next();
}
