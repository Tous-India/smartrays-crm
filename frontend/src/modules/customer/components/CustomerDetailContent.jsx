import { useState } from "react";
import { App, Row, Col } from "antd";
import CustomerHeaderSection from "./CustomerHeaderSection";
import CustomerEditModal from "./CustomerEditModal";
import CustomerBillingCard from "./CustomerBillingCard";
import CustomerSiteDetailsCard from "./CustomerSiteDetailsCard";
import CustomerContractsSection from "./CustomerContractsSection";
import CustomerContactsSection from "./CustomerContactsSection";
import CustomerActivityLog from "./CustomerActivityLog";
import CustomerAmcSection from "../../amc/components/CustomerAmcSection";
import { updateCustomer, deleteCustomer } from "../api/customerApi";
import { usePermission } from "../../../hooks/usePermission";

/**
 * Composes every section of the Customer Detail Page. Unlike Lead Detail (a
 * slide-over), this is a real full page — the functional spec calls it a
 * dedicated "Customer Detail Page," not a panel, and there's meaningfully
 * more content here than a slide-over comfortably holds.
 *
 * **Structure reworked 2026-08-05**, diverging from
 * leads-customer-functional-spec.md's original section order:
 * - **Site & Installation Details first**, above Billing — for a solar
 *   install this is the identifying "what is this job" information, so it
 *   reads before the commercial terms rather than after them.
 * - **Contacts and Contracts side by side.** Both are short list sections
 *   that wasted a full page-width row each when stacked. `xs={24} lg={12}`
 *   so they pair up only from `lg` (992px) and stack again below it — a
 *   two-column split on a tablet/phone would squeeze both list rows (name +
 *   tags + action buttons) past readability, and the point is to save
 *   vertical space where there's width to spare, not to force two columns
 *   everywhere. No fixed widths anywhere, so nothing can overflow
 *   horizontally.
 * - **Invoice History removed entirely** (component deleted, not hidden).
 *   Invoicing is descoped: `Invoice` is a deliberate backend placeholder
 *   model with no service or controller, and `GET /customers/:id/invoices`
 *   /`/ledger` were never built, so the section could never show real data.
 *   There was no data fetch to remove alongside it — the placeholder was
 *   static, and `useCustomerDetail` never requested invoices.
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

      <CustomerSiteDetailsCard customer={customer} onEdit={() => setIsEditOpen(true)} />

      <CustomerBillingCard customer={customer} onEdit={() => setIsEditOpen(true)} />

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <CustomerContactsSection customerId={customer._id} contacts={contacts} onChanged={onChanged} />
        </Col>
        <Col xs={24} lg={12}>
          <CustomerContractsSection
            customerId={customer._id}
            contracts={contracts}
            canEdit={canEdit}
            onChanged={onChanged}
          />
        </Col>
      </Row>

      {/* AMC (2026-08-05) — moved here from the retired standalone `/amc`
          page. Fetches its own records (`GET /amc?customerId=`) rather than
          being threaded through `useCustomerDetail`, so a customer with no
          AMC costs nothing on the rest of the page and an AMC failure can't
          break the whole detail view. */}
      <CustomerAmcSection customerId={customer._id} />

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
