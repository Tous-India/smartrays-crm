import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { generateReport } from "./report.service.js";

export const generate = asyncWrapper(async (req, res) => {
  const { module, filters, format } = req.body;

  const result = await generateReport({ module, filters: filters || {}, format: format || "xlsx" }, req.user);

  res.status(200).json(new ApiResponse(200, result, "Report generated successfully"));
});
