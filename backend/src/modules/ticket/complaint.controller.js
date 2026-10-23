import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  listComplaints,
  listAssignees,
  getComplaintDetail,
  assignComplaint,
  changeComplaintStatus,
  addComplaintPhoto,
  sendComplaintBack,
  listCustomerOptions,
  linkComplaintCustomer,
  saveComplaintContact,
} from "./complaint.service.js";

export const list = asyncWrapper(async (req, res) => {
  const complaints = await listComplaints(req.query, req.user);

  res.status(200).json(new ApiResponse(200, complaints, "Complaints fetched successfully"));
});

export const assignees = asyncWrapper(async (req, res) => {
  const people = await listAssignees();

  res.status(200).json(new ApiResponse(200, people, "Staff fetched successfully"));
});

export const detail = asyncWrapper(async (req, res) => {
  const complaint = await getComplaintDetail(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, complaint, "Complaint fetched successfully"));
});

export const assign = asyncWrapper(async (req, res) => {
  const complaint = await assignComplaint(req.params.id, req.body, req.user);

  res.status(200).json(new ApiResponse(200, complaint, "Complaint assigned"));
});

export const changeStatus = asyncWrapper(async (req, res) => {
  const complaint = await changeComplaintStatus(req.params.id, req.body, req.user);

  res.status(200).json(new ApiResponse(200, complaint, "Complaint updated"));
});

export const addPhoto = asyncWrapper(async (req, res) => {
  const complaint = await addComplaintPhoto(req.params.id, req.file, req.user);

  res.status(201).json(new ApiResponse(201, complaint, "Photo added"));
});

export const sendBack = asyncWrapper(async (req, res) => {
  const result = await sendComplaintBack(req.params.id, req.body, req.user);

  res.status(200).json(new ApiResponse(200, result, "Complaint sent back"));
});

export const customerOptions = asyncWrapper(async (req, res) => {
  const options = await listCustomerOptions(req.query, req.user);

  res.status(200).json(new ApiResponse(200, options, "Customers fetched successfully"));
});

export const linkCustomer = asyncWrapper(async (req, res) => {
  const complaint = await linkComplaintCustomer(req.params.id, req.body, req.user);

  res.status(200).json(new ApiResponse(200, complaint, "Complaint linked to the customer"));
});

export const saveContact = asyncWrapper(async (req, res) => {
  const complaint = await saveComplaintContact(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, complaint, "Number saved as a contact"));
});
