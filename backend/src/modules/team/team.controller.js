import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  listTeams,
  getTeamById,
  createTeam,
  updateTeam,
  deleteTeam,
  getTeamMembers,
  addMemberToTeam,
  removeMemberFromTeam,
} from "./team.service.js";

export const list = asyncWrapper(async (req, res) => {
  const teams = await listTeams();

  res.status(200).json(new ApiResponse(200, teams, "Teams fetched successfully"));
});

export const getOne = asyncWrapper(async (req, res) => {
  const team = await getTeamById(req.params.id);

  res.status(200).json(new ApiResponse(200, team, "Team fetched successfully"));
});

export const create = asyncWrapper(async (req, res) => {
  const team = await createTeam(req.body);

  res.status(201).json(new ApiResponse(201, team, "Team created successfully"));
});

export const update = asyncWrapper(async (req, res) => {
  const team = await updateTeam(req.params.id, req.body);

  res.status(200).json(new ApiResponse(200, team, "Team updated successfully"));
});

export const remove = asyncWrapper(async (req, res) => {
  await deleteTeam(req.params.id);

  res.status(200).json(new ApiResponse(200, null, "Team deleted successfully"));
});

export const getMembers = asyncWrapper(async (req, res) => {
  const members = await getTeamMembers(req.params.id);

  res.status(200).json(new ApiResponse(200, members, "Team members fetched successfully"));
});

export const addMember = asyncWrapper(async (req, res) => {
  const user = await addMemberToTeam(req.params.id, req.body.userId);

  res.status(200).json(new ApiResponse(200, user, "Member added to team"));
});

export const removeMember = asyncWrapper(async (req, res) => {
  const user = await removeMemberFromTeam(req.params.id, req.params.userId);

  res.status(200).json(new ApiResponse(200, user, "Member removed from team"));
});
