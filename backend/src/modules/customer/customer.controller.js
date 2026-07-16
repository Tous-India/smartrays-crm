import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  createCustomer,
  listCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  bulkUpdateCustomers,
  listContacts,
  createContact,
  updateContact,
  deleteContact,
  listContracts,
  createContract,
  updateContract,
  deleteContract,
  listCredentials,
  createCredential,
  updateCredential,
  deleteCredential,
  revealCredential,
  listActivity,
} from "./customer.service.js";

export const create = asyncWrapper(async (req, res) => {
  const customer = await createCustomer(req.body, req.user);

  res.status(201).json(new ApiResponse(201, customer, "Customer created successfully"));
});

export const list = asyncWrapper(async (req, res) => {
  const customers = await listCustomers(req.query, req.user);

  res.status(200).json(new ApiResponse(200, customers, "Customers fetched successfully"));
});

export const getOne = asyncWrapper(async (req, res) => {
  const customer = await getCustomerById(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, customer, "Customer fetched successfully"));
});

export const update = asyncWrapper(async (req, res) => {
  const customer = await updateCustomer(req.params.id, req.body, req.user);

  res.status(200).json(new ApiResponse(200, customer, "Customer updated successfully"));
});

export const remove = asyncWrapper(async (req, res) => {
  await deleteCustomer(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, null, "Customer deleted successfully"));
});

export const bulkUpdate = asyncWrapper(async (req, res) => {
  const results = await bulkUpdateCustomers(req.body, req.user);

  res.status(200).json(new ApiResponse(200, results, "Bulk action completed"));
});

export const getContacts = asyncWrapper(async (req, res) => {
  const contacts = await listContacts(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, contacts, "Contacts fetched successfully"));
});

export const addContact = asyncWrapper(async (req, res) => {
  const contact = await createContact(req.params.id, req.body, req.user);

  res.status(201).json(new ApiResponse(201, contact, "Contact added successfully"));
});

export const editContact = asyncWrapper(async (req, res) => {
  const contact = await updateContact(req.params.id, req.params.contactId, req.body, req.user);

  res.status(200).json(new ApiResponse(200, contact, "Contact updated successfully"));
});

export const removeContact = asyncWrapper(async (req, res) => {
  await deleteContact(req.params.id, req.params.contactId, req.user);

  res.status(200).json(new ApiResponse(200, null, "Contact removed successfully"));
});

export const getContracts = asyncWrapper(async (req, res) => {
  const contracts = await listContracts(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, contracts, "Contracts fetched successfully"));
});

export const addContract = asyncWrapper(async (req, res) => {
  const contract = await createContract(req.params.id, req.body, req.user);

  res.status(201).json(new ApiResponse(201, contract, "Contract added successfully"));
});

export const editContract = asyncWrapper(async (req, res) => {
  const contract = await updateContract(req.params.id, req.params.contractId, req.body, req.user);

  res.status(200).json(new ApiResponse(200, contract, "Contract updated successfully"));
});

export const removeContract = asyncWrapper(async (req, res) => {
  await deleteContract(req.params.id, req.params.contractId, req.user);

  res.status(200).json(new ApiResponse(200, null, "Contract removed successfully"));
});

export const getCredentials = asyncWrapper(async (req, res) => {
  const credentials = await listCredentials(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, credentials, "Credentials fetched successfully"));
});

export const addCredential = asyncWrapper(async (req, res) => {
  const credential = await createCredential(req.params.id, req.body, req.user);

  res.status(201).json(new ApiResponse(201, credential, "Credential added successfully"));
});

export const editCredential = asyncWrapper(async (req, res) => {
  const credential = await updateCredential(req.params.id, req.params.credId, req.body, req.user);

  res.status(200).json(new ApiResponse(200, credential, "Credential updated successfully"));
});

export const removeCredential = asyncWrapper(async (req, res) => {
  await deleteCredential(req.params.id, req.params.credId, req.user);

  res.status(200).json(new ApiResponse(200, null, "Credential removed successfully"));
});

export const reveal = asyncWrapper(async (req, res) => {
  const result = await revealCredential(req.params.id, req.params.credId, req.user);

  res.status(200).json(new ApiResponse(200, result, "Credential revealed"));
});

export const getActivity = asyncWrapper(async (req, res) => {
  const activity = await listActivity(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, activity, "Activity log fetched successfully"));
});
