import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { createPayment, listPayments } from "./payment.service.js";

export const create = asyncWrapper(async (req, res) => {
  const payment = await createPayment(req.body, req.user);

  res.status(201).json(new ApiResponse(201, payment, "Payment recorded successfully"));
});

export const list = asyncWrapper(async (req, res) => {
  const { from, to, page, limit } = req.query;
  const result = await listPayments({ from, to, page, limit });

  res.status(200).json(new ApiResponse(200, result, "Payments fetched successfully"));
});
