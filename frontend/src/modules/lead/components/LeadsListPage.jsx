import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { message } from "antd";
import LeadFiltersBar from "./LeadFiltersBar";
import LeadsTable from "./LeadsTable";
import LeadBoard from "./LeadBoard";
import LeadFormModal from "./LeadFormModal";
import LostReasonModal from "./LostReasonModal";
import ConvertToCustomerModal from "./ConvertToCustomerModal";
import ImportWizardModal from "./ImportWizardModal";
import useLeads from "../hooks/useLeads";
import useLeadStatusChangeFlow from "../hooks/useLeadStatusChangeFlow";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useSessionStore from "../../../store/sessionStore";
import { usePermission } from "../../../hooks/usePermission";
import { createLead, updateLead, toggleHotFlag, exportLeads } from "../api/leadApi";
import { ROUTE_PATHS } from "../../../constants/routePaths.constants";

/**
 * Shared shell for `/leads` (Table) and `/leads/board` (Board) — one page
 * component behind both routes, per §8's "toggle between Table/Board from
 * the same page." Filters live in the URL's search params so switching
 * views (which navigates between the two routes) never loses the current
 * search/owner/follow-up selection.
 */
function LeadsListPage({ view }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { users } = useUserDirectory();
  const currentUser = useSessionStore((state) => state.user);
  const canEdit = usePermission("leads", "edit");
  const canReassignOwner = canEdit && currentUser?.role !== "sales_associate";

  const filters = {
    search: searchParams.get("search") || "",
    owner: searchParams.get("owner") || "",
    followUp: searchParams.get("followUp") || "",
  };

  const { leads, isLoading, refetch } = useLeads(filters);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const statusFlow = useLeadStatusChangeFlow({ onChanged: refetch });

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

  function handleViewChange(nextView) {
    const path = nextView === "board" ? ROUTE_PATHS.LEADS_BOARD : ROUTE_PATHS.LEADS;
    navigate({ pathname: path, search: searchParams.toString() });
  }

  async function handleCreateLead(values) {
    setIsSubmittingForm(true);

    try {
      await createLead(values);
      message.success("Lead created");
      setIsFormOpen(false);
      refetch();
    } finally {
      setIsSubmittingForm(false);
    }
  }

  async function handleToggleHot(lead) {
    await toggleHotFlag(lead._id);
    refetch();
  }

  async function handleAssignOwner(lead, ownerId) {
    await updateLead(lead._id, { ownerId });
    refetch();
  }

  async function handleExport() {
    setIsExporting(true);

    try {
      const response = await exportLeads(filters);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = "leads-export.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleConfirmWon(convertPayload) {
    const customer = await statusFlow.confirmWon(convertPayload);
    message.success("Lead converted to customer");
    navigate(`/customers/${customer._id}`);
  }

  return (
    <div>
      <LeadFiltersBar
        filters={filters}
        onFilterChange={handleFilterChange}
        view={view}
        onViewChange={handleViewChange}
        onNewLead={() => setIsFormOpen(true)}
        onImport={() => setIsImportOpen(true)}
        onExport={handleExport}
        isExporting={isExporting}
      />

      {view === "table" ? (
        <LeadsTable
          leads={leads}
          isLoading={isLoading}
          users={users}
          canEdit={canEdit}
          canReassignOwner={canReassignOwner}
          onRequestStatusChange={statusFlow.requestStatusChange}
          onToggleHot={handleToggleHot}
          onAssignOwner={handleAssignOwner}
        />
      ) : (
        <LeadBoard leads={leads} canEdit={canEdit} onRequestStatusChange={statusFlow.requestStatusChange} />
      )}

      <LeadFormModal
        open={isFormOpen}
        mode="create"
        onCancel={() => setIsFormOpen(false)}
        onSubmit={handleCreateLead}
        isSubmitting={isSubmittingForm}
      />

      <ImportWizardModal
        open={isImportOpen}
        onCancel={() => setIsImportOpen(false)}
        onImported={refetch}
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
    </div>
  );
}

export default LeadsListPage;
