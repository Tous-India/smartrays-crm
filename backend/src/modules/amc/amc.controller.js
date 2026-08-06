import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { createAMC, listAMC, updateAMC, renewAMC } from "./amc.service.js";

export const create = asyncWrapper(async (req, res) => {
  const amc = await createAMC(req.body, req.user);

  res.status(201).json(new ApiResponse(201, amc, "AMC record created successfully"));
});

export const list = asyncWrapper(async (req, res) => {
  const records = await listAMC(req.user, {
    customerId: req.query.customerId,
    // Any truthy string except "false" — the frontend sends `true`.
    expiringSoon: req.query.expiringSoon === "true" || req.query.expiringSoon === true,
  });

  res.status(200).json(new ApiResponse(200, records, "AMC records fetched successfully"));
});

export const update = asyncWrapper(async (req, res) => {
  const amc = await updateAMC(req.params.id, req.body, req.user);

  res.status(200).json(new ApiResponse(200, amc, "AMC record updated successfully"));
});

export const renew = asyncWrapper(async (req, res) => {
  const amc = await renewAMC(req.params.id, req.body, req.user);

  res.status(201).json(new ApiResponse(201, amc, "AMC renewed successfully"));
});
