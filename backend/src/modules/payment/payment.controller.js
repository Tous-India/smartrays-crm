import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { createPayment, listPayments } from "./payment.service.js";

export const create = asyncWrapper(async (req, res) => {
  const payment = await createPayment(req.body, req.user);

  res.status(201).json(new ApiResponse(201, payment, "Payment recorded successfully"));
});

export const list = asyncWrapper(async (req, res) => {
  const payments = await listPayments();

  res.status(200).json(new ApiResponse(200, payments, "Payments fetched successfully"));
});
