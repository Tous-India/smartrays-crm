import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  submitPing,
  getLiveLocations,
  getLocationHistory,
  getPingIntervalConfig,
} from "./location.service.js";

export const create = asyncWrapper(async (req, res) => {
  const { coords, capturedAt } = req.body;

  const ping = await submitPing({ coords, capturedAt }, req.user);

  res.status(201).json(new ApiResponse(201, ping, "Location ping recorded"));
});

export const live = asyncWrapper(async (req, res) => {
  const liveLocations = await getLiveLocations(req.user);

  res.status(200).json(new ApiResponse(200, liveLocations, "Live locations fetched successfully"));
});

export const history = asyncWrapper(async (req, res) => {
  const { employeeId, date } = req.query;

  const pings = await getLocationHistory({ employeeId, date }, req.user);

  res.status(200).json(new ApiResponse(200, pings, "Location history fetched successfully"));
});

export const config = asyncWrapper(async (req, res) => {
  const pingConfig = getPingIntervalConfig();

  res.status(200).json(new ApiResponse(200, pingConfig, "Location config fetched successfully"));
});
