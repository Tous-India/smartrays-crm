import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { message } from "antd";
import CustomersFiltersBar from "./CustomersFiltersBar";
import CustomersTable from "./CustomersTable";
import CustomerFormWizard from "./CustomerFormWizard";
import useCustomers from "../hooks/useCustomers";
import useUserDirectory from "../../../hooks/useUserDirectory";
import { createCustomer, createContract, createContact, bulkUpdateCustomers } from "../api/customerApi";
import { CONTRACT_TYPE_LABELS } from "../constants/customer.constants";

const AUTOMATION_CONTRACT_TYPES = ["monthly", "onetime"];

/**
 * `/customers` — the List View. Filters live in the URL's search params,
 * matching the Leads module's convention.
 */
function CustomersListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { users } = useUserDirectory();

  // UI-facing filter state: status is one of "active" | "inactive" | "all"
  // (an explicit "all" sentinel, not an empty string, so it round-trips
  // through the URL's search params distinctly from "no status param set
  // yet" — both of which would otherwise collapse to the same falsy value).
  const filters = {
    search: searchParams.get("search") || "",
    owner: searchParams.get("owner") || "",
    status: searchParams.get("status") || "active",
  };

  // The backend's `GET /customers?status=` only understands a real
  // `customerStatus` value or no param at all — "all" isn't one of its
  // enum values, so it's translated to "omit the filter" here, right at the
  // API boundary, rather than teaching the backend a UI-only concept.
  const apiFilters = {
    search: filters.search,
    owner: filters.owner,
    status: filters.status === "all" ? "" : filters.status,
  };

  const { customers, isLoading, refetch } = useCustomers(apiFilters);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [isBulkActing, setIsBulkActing] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isSubmittingWizard, setIsSubmittingWizard] = useState(false);

  function handleFilterChange(patch) {
    const next = { ...filters, ...patch };
    const nextParams = new URLSearchParams();
    Object.entries(next).forEach(([key, value]) => {
      if (value) {
        nextParams.set(key, value);
      }
    });
    setSearchParams(nextParams);
  }

  async function handleBulkAction(action) {
    setIsBulkActing(true);

    try {
      await bulkUpdateCustomers({ ids: selectedRowKeys, action });
      message.success("Bulk action completed");
      setSelectedRowKeys([]);
      refetch();
    } finally {
      setIsBulkActing(false);
    }
  }

  /**
   * Creates the customer, then each staged contract/contact in turn (the
   * backend has no single "customer with nested contracts/contacts" create
   * endpoint — each is its own resource). Contract creation is what
   * actually triggers the backend's project/invoice automation
   * (`customer.service.js#applyContractCreatedAutomation`) — invisible
   * unless called out, so the success message explicitly names which
   * contracts triggered it, per this task's own instruction.
   */
  async function handleCreateCustomer(values) {
    setIsSubmittingWizard(true);

    try {
      const { contracts = [], contacts = [], ...customerPayload } = values;
      const customerResponse = await createCustomer(customerPayload);
      const customerId = customerResponse.data.data._id;

      for (const contract of contracts) {
        await createContract(customerId, {
          ...contract,
          renewalDate: contract.renewalDate ? contract.renewalDate.toISOString() : null,
        });
      }

      for (const contact of contacts) {
        await createContact(customerId, contact);
      }

      const automatedContracts = contracts.filter((contract) =>
        AUTOMATION_CONTRACT_TYPES.includes(contract.type)
      );

      let successMessage = "Customer created";
      if (automatedContracts.length > 0) {
        const contractLabels = automatedContracts
          .map((contract) => CONTRACT_TYPE_LABELS[contract.type])
          .join(", ");
        successMessage += ` — Project + draft Invoice auto-created for: ${contractLabels}`;
      }

      message.success(successMessage);
      setIsWizardOpen(false);
      refetch();
    } finally {
      setIsSubmittingWizard(false);
    }
  }

  return (
    <div>
      <CustomersFiltersBar
        filters={filters}
        onFilterChange={handleFilterChange}
        onNewCustomer={() => setIsWizardOpen(true)}
      />

      <CustomersTable
        customers={customers}
        isLoading={isLoading}
        users={users}
        selectedRowKeys={selectedRowKeys}
        onSelectionChange={setSelectedRowKeys}
        onBulkAction={handleBulkAction}
        isBulkActing={isBulkActing}
        onChanged={refetch}
      />

      <CustomerFormWizard
        open={isWizardOpen}
        onCancel={() => setIsWizardOpen(false)}
        onSubmit={handleCreateCustomer}
        isSubmitting={isSubmittingWizard}
      />
    </div>
  );
}

export default CustomersListPage;
