import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import {
  create,
  list,
  getOne,
  update,
  remove,
  bulkUpdate,
  getContacts,
  addContact,
  editContact,
  removeContact,
  getContracts,
  addContract,
  editContract,
  removeContract,
  getCredentials,
  addCredential,
  editCredential,
  removeCredential,
  reveal,
  getActivity,
} from "./customer.controller.js";
import {
  validateCreateCustomerInput,
  validateUpdateCustomerInput,
  validateBulkActionInput,
  validateContactInput,
  validateContactUpdateInput,
  validateContractInput,
  validateCredentialInput,
  validateCredentialUpdateInput,
} from "./customer.validation.js";

const customerRouter = Router();

// credentials.view is required on top of customers.view/edit for every
// credentials sub-route — §7.2: "gated behind credentials.view on top of
// customers.view." Chaining two authorize() calls is an AND gate: each just
// calls next() if permitted, same technique used nowhere else yet but
// nothing new needed in authorize.middleware.js to support it.
const requireCustomersView = authorize("customers", "view");
const requireCustomersEdit = authorize("customers", "edit");
const requireCredentialsView = authorize("credentials", "view");

customerRouter.get("/", authenticate, requireCustomersView, list);
customerRouter.post("/", authenticate, authorize("customers", "create"), validateCreateCustomerInput, create);

// Registered before "/:id" so Express never matches "bulk" as a customer id.
customerRouter.post("/bulk", authenticate, validateBulkActionInput, bulkUpdate);

customerRouter.get("/:id", authenticate, requireCustomersView, getOne);
customerRouter.patch("/:id", authenticate, requireCustomersEdit, validateUpdateCustomerInput, update);
customerRouter.delete("/:id", authenticate, authorize("customers", "delete"), remove);

customerRouter.get("/:id/contacts", authenticate, requireCustomersView, getContacts);
customerRouter.post("/:id/contacts", authenticate, requireCustomersEdit, validateContactInput, addContact);
customerRouter.patch(
  "/:id/contacts/:contactId",
  authenticate,
  requireCustomersEdit,
  validateContactUpdateInput,
  editContact
);
customerRouter.delete("/:id/contacts/:contactId", authenticate, requireCustomersEdit, removeContact);

customerRouter.get("/:id/contracts", authenticate, requireCustomersView, getContracts);
customerRouter.post("/:id/contracts", authenticate, requireCustomersEdit, validateContractInput, addContract);
customerRouter.patch(
  "/:id/contracts/:contractId",
  authenticate,
  requireCustomersEdit,
  editContract
);
customerRouter.delete("/:id/contracts/:contractId", authenticate, requireCustomersEdit, removeContract);

customerRouter.get(
  "/:id/credentials",
  authenticate,
  requireCustomersView,
  requireCredentialsView,
  getCredentials
);
customerRouter.post(
  "/:id/credentials",
  authenticate,
  requireCustomersEdit,
  requireCredentialsView,
  validateCredentialInput,
  addCredential
);
customerRouter.patch(
  "/:id/credentials/:credId",
  authenticate,
  requireCustomersEdit,
  requireCredentialsView,
  validateCredentialUpdateInput,
  editCredential
);
customerRouter.delete(
  "/:id/credentials/:credId",
  authenticate,
  requireCustomersEdit,
  requireCredentialsView,
  removeCredential
);
customerRouter.post(
  "/:id/credentials/:credId/reveal",
  authenticate,
  requireCustomersView,
  requireCredentialsView,
  reveal
);

customerRouter.get("/:id/activity", authenticate, requireCustomersView, getActivity);

export default customerRouter;
