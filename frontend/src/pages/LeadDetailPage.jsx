import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Drawer, Spin, message, Space, Tag } from "antd";
import { FireFilled } from "@ant-design/icons";
import useLeadDetail from "../modules/lead/hooks/useLeadDetail";
import useLeadStatusChangeFlow from "../modules/lead/hooks/useLeadStatusChangeFlow";
import useUserDirectory from "../hooks/useUserDirectory";
import LeadDetailContent from "../modules/lead/components/LeadDetailContent";
import LogCallModal from "../modules/lead/components/LogCallModal";
import LeadFormModal from "../modules/lead/components/LeadFormModal";
import LostReasonModal from "../modules/lead/components/LostReasonModal";
import ConvertToCustomerModal from "../modules/lead/components/ConvertToCustomerModal";
import { logLeadCall, updateLead, deleteLead, convertLeadToCustomer } from "../modules/lead/api/leadApi";
import { createContract } from "../modules/customer/api/customerApi";
import { ROUTE_PATHS } from "../constants/routePaths.constants";
import { LEAD_STATUS_COLORS, LEAD_STATUS_LABELS } from "../modules/lead/constants/lead.constants";

/**
 * A real route (`/leads/:id`, linkable/refreshable) that renders as a
 * slide-over per leads-customer-functional-spec.md, not a full page
 * navigation — closing it (or the drawer's own close button) goes back to
 * `/leads`.
 */
function LeadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { lead, callHistory, isLoading, refetch } = useLeadDetail(id);
  const { users } = useUserDirectory();

  const [isLogCallOpen, setIsLogCallOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // "Won" goes through the shared won/lost flow (Convert-to-Customer modal
  // + forced status change to won, per the functional spec's "Won ...
  // triggers Convert to Customer flow"). "Lost" uses the same flow's lost
  // half. The standalone "Convert to Customer" button below is intentionally
  // separate — it converts without forcing status to won, for converting a
  // lead that hasn't been marked won yet.
  const statusFlow = useLeadStatusChangeFlow({ onChanged: refetch });
  const [isConvertOnlyOpen, setIsConvertOnlyOpen] = useState(false);

  function handleClose() {
    navigate(ROUTE_PATHS.LEADS);
  }

  if (isLoading || !lead) {
    return (
      <Drawer open width={640} onClose={handleClose} title="Loading...">
        <div className="flex justify-center py-12">
          <Spin size="large" />
        </div>
      </Drawer>
    );
  }

  // `useUserDirectory()` only returns active users (`GET /users/dropdown`,
  // `isActive: true`) — a lead owned by a since-deactivated user won't be
  // found here. Falling through to `undefined` would render as "—" via
  // `LeadDetailContent`'s own `ownerName || "—"`, indistinguishable from
  // "no owner set at all" — "Unknown user" is more honest when an owner
  // genuinely exists but can't be resolved to a name right now.
  const ownerName = users.find((user) => user._id === lead.ownerId)?.name || (lead.ownerId ? "Unknown user" : null);

  async function handleLogCall(values) {
    setIsSubmitting(true);
    try {
      await logLeadCall(id, values);
      message.success("Call logged");
      setIsLogCallOpen(false);
      refetch();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleHot() {
    await updateLead(id, { isHot: !lead.isHot }).catch(() => {});
    refetch();
  }

  async function handleEditSubmit(values) {
    setIsSubmitting(true);
    try {
      await updateLead(id, values);
      message.success("Lead updated");
      setIsEditOpen(false);
      refetch();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    await deleteLead(id);
    message.success("Lead deleted");
    navigate(ROUTE_PATHS.LEADS);
  }

  async function handleConfirmWon(convertPayload) {
    const customer = await statusFlow.confirmWon(convertPayload);
    message.success("Lead converted to customer");
    navigate(`/customers/${customer._id}`);
  }

  async function handleConfirmConvertOnly({ contractAmount, ...customerPayload }) {
    setIsSubmitting(true);
    try {
      const response = await convertLeadToCustomer(id, customerPayload);
      const customer = response.data.data;
      await createContract(customer._id, { type: "onetime", amount: contractAmount });
      message.success("Lead converted to customer");
      setIsConvertOnlyOpen(false);
      navigate(`/customers/${customer._id}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Drawer
        open
        width={640}
        onClose={handleClose}
        title={
          <Space>
            {lead.name}
            {/* Inline `style`, not a Tailwind className — the Drawer's own
                title styling sets a color on its children that a plain
                utility class loses to (verified: stayed near-black even for
                a genuinely hot lead until switched to inline style). */}
            {lead.isHot && <FireFilled style={{ color: "#fa8c16" }} title="Hot lead" />}
            <Tag color={LEAD_STATUS_COLORS[lead.status]}>{LEAD_STATUS_LABELS[lead.status]}</Tag>
          </Space>
        }
      >
        <LeadDetailContent
          lead={lead}
          callHistory={callHistory}
          ownerName={ownerName}
          onLogCall={() => setIsLogCallOpen(true)}
          onToggleHot={handleToggleHot}
          onWon={() => statusFlow.requestStatusChange(lead, "won")}
          onLost={() => statusFlow.requestStatusChange(lead, "lost")}
          onConvert={() => setIsConvertOnlyOpen(true)}
          onEdit={() => setIsEditOpen(true)}
          onDelete={handleDelete}
        />
      </Drawer>

      <LogCallModal
        open={isLogCallOpen}
        onCancel={() => setIsLogCallOpen(false)}
        onSubmit={handleLogCall}
        isSubmitting={isSubmitting}
      />

      <LeadFormModal
        open={isEditOpen}
        mode="edit"
        initialLead={lead}
        onCancel={() => setIsEditOpen(false)}
        onSubmit={handleEditSubmit}
        isSubmitting={isSubmitting}
      />

      <LostReasonModal
        open={Boolean(statusFlow.lostTarget)}
        leadName={statusFlow.lostTarget?.name}
        onCancel={statusFlow.cancelLost}
        onConfirm={statusFlow.confirmLost}
        isSubmitting={statusFlow.isSubmitting}
      />

      <ConvertToCustomerModal
        open={Boolean(statusFlow.wonTarget)}
        lead={statusFlow.wonTarget}
        onCancel={statusFlow.cancelWon}
        onConfirm={handleConfirmWon}
        isSubmitting={statusFlow.isSubmitting}
      />

      <ConvertToCustomerModal
        open={isConvertOnlyOpen}
        lead={lead}
        onCancel={() => setIsConvertOnlyOpen(false)}
        onConfirm={handleConfirmConvertOnly}
        isSubmitting={isSubmitting}
      />
    </>
  );
}

export default LeadDetailPage;
