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
