import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import ApiError from "../../utils/ApiError.js";
import { createVisit, listVisits, getVisit, arriveAtVisit, addVisitPhoto, completeVisit, listVisitCustomerOptions } from "./visit.service.js";

function parseCoords(raw) {
  if (raw && typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, "Your location is needed. Please allow location and try again.");
  }
}

export const create = asyncWrapper(async (req, res) => {
  const visit = await createVisit(req.body, req.user);
  res.status(201).json(new ApiResponse(201, visit, "Visit assigned"));
});

export const customerOptions = asyncWrapper(async (req, res) => {
  const options = await listVisitCustomerOptions(req.user);
  res.status(200).json(new ApiResponse(200, options, "Customers fetched successfully"));
});

export const list = asyncWrapper(async (req, res) => {
  const visits = await listVisits(req.query, req.user);
  res.status(200).json(new ApiResponse(200, visits, "Visits fetched successfully"));
});

export const getOne = asyncWrapper(async (req, res) => {
  const visit = await getVisit(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, visit, "Visit fetched successfully"));
});

export const arrive = asyncWrapper(async (req, res) => {
  const visit = await arriveAtVisit(req.params.id, parseCoords(req.body.coords), req.user);
  res.status(200).json(new ApiResponse(200, visit, "Arrival recorded"));
});

export const addPhoto = asyncWrapper(async (req, res) => {
  const visit = await addVisitPhoto(req.params.id, { coords: parseCoords(req.body.coords), capturedAt: req.body.capturedAt }, req.file, req.user);
  res.status(201).json(new ApiResponse(201, visit, "Photo added"));
});

export const complete = asyncWrapper(async (req, res) => {
  const visit = await completeVisit(req.params.id, { coords: parseCoords(req.body.coords), notes: req.body.notes }, req.user);
  res.status(200).json(new ApiResponse(200, visit, "Visit done"));
});
