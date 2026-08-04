import asyncWrapper from "../../utils/asyncWrapper.js";
import { generateReport } from "./report.service.js";

const REPORT_CONTENT_TYPES = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const generate = asyncWrapper(async (req, res) => {
  const { module, filters } = req.body;
  const format = req.body.format || "xlsx";

  const buffer = await generateReport({ module, filters: filters || {}, format }, req.user);

  res.setHeader("Content-Type", REPORT_CONTENT_TYPES[format]);
  res.setHeader("Content-Disposition", `attachment; filename=${module}-report.${format}`);
  res.status(200).send(buffer);
});
