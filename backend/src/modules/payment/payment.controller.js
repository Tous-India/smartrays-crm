import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  createPayment,
  listPayments,
  updatePayment,
  softDeletePayment,
  getPaymentAuditLog,
} from "./payment.service.js";

export const create = asyncWrapper(async (req, res) => {
  const payment = await createPayment(req.body, req.user);

  res.status(201).json(new ApiResponse(201, payment, "Payment recorded successfully"));
});

export const list = asyncWrapper(async (req, res) => {
  const { from, to, page, limit } = req.query;
  const result = await listPayments({ from, to, page, limit });

  res.status(200).json(new ApiResponse(200, result, "Payments fetched successfully"));
});

export const update = asyncWrapper(async (req, res) => {
  const payment = await updatePayment(req.params.id, req.body, req.user);

  res.status(200).json(new ApiResponse(200, payment, "Payment updated successfully"));
});

export const remove = asyncWrapper(async (req, res) => {
  await softDeletePayment(req.params.id, req.body.reason, req.user);

  res.status(200).json(new ApiResponse(200, null, "Payment deleted successfully"));
});

export const getAuditLog = asyncWrapper(async (req, res) => {
  const entries = await getPaymentAuditLog(req.params.id);

  res.status(200).json(new ApiResponse(200, entries, "Payment audit log fetched successfully"));
});
