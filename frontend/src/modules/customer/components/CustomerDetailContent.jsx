import { useState } from "react";
import { App } from "antd";
import CustomerHeaderSection from "./CustomerHeaderSection";
import CustomerEditModal from "./CustomerEditModal";
import CustomerBillingCard from "./CustomerBillingCard";
import CustomerSiteDetailsCard from "./CustomerSiteDetailsCard";
import CustomerContractsSection from "./CustomerContractsSection";
import CustomerContactsSection from "./CustomerContactsSection";
import CustomerInvoicePlaceholder from "./CustomerInvoicePlaceholder";
import CustomerActivityLog from "./CustomerActivityLog";
import { updateCustomer, deleteCustomer } from "../api/customerApi";
import { usePermission } from "../../../hooks/usePermission";

/**
 * Composes every section of the Customer Detail Page, per
 * leads-customer-functional-spec.md's Customer Detail Page structure —
 * Header, Billing, Contracts, Contacts, Invoice History (placeholder — see
 * CustomerInvoicePlaceholder.jsx), Activity Log. Unlike Lead Detail (a
 * slide-over), this is a real full page — the functional spec calls it a
 * dedicated "Customer Detail Page," not a panel, and there's meaningfully
 * more content here than a slide-over comfortably holds.
 *
 * **Credentials Vault deliberately removed from this page** (see
 * `frontend/README.md`'s Customer module section and `.context/final-
 * plan.md` for the full note) — the backend `Credential` model, its
 * encryption, and any already-stored data are untouched; this is a
 * frontend-only removal, not a rollback of the feature's data layer. No UI
 * anywhere in the app reaches it right now.
 */
function CustomerDetailContent({ customer, contacts, contracts, activity, onChanged, onDeleted }) {
  const { message } = App.useApp();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const canEdit = usePermission("customers", "edit");

  async function handleEditSubmit(values) {
    setIsSubmittingEdit(true);

    try {
      await updateCustomer(customer._id, values);
      message.success("Customer updated");
      setIsEditOpen(false);
      onChanged();
    } finally {
      setIsSubmittingEdit(false);
    }
  }

  async function handleDelete() {
    await deleteCustomer(customer._id);
    message.success("Customer deleted");
    onDeleted();
  }

  return (
    <div>
      <CustomerHeaderSection
        customer={customer}
        onEdit={() => setIsEditOpen(true)}
        onDelete={handleDelete}
        onChanged={onChanged}
      />

      <CustomerBillingCard customer={customer} onEdit={() => setIsEditOpen(true)} />

      <CustomerSiteDetailsCard customer={customer} onEdit={() => setIsEditOpen(true)} />

      <CustomerContractsSection
        customerId={customer._id}
        contracts={contracts}
        canEdit={canEdit}
        onChanged={onChanged}
      />

      <CustomerContactsSection customerId={customer._id} contacts={contacts} onChanged={onChanged} />

      <CustomerInvoicePlaceholder />

      <CustomerActivityLog activity={activity} />

      <CustomerEditModal
        open={isEditOpen}
        customer={customer}
        onCancel={() => setIsEditOpen(false)}
        onSubmit={handleEditSubmit}
        isSubmitting={isSubmittingEdit}
      />
    </div>
  );
}

export default CustomerDetailContent;
