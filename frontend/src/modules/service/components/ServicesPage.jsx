import { useMemo, useState } from "react";
import { Alert, Badge, Button, Empty, Result, Spin, App } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import PermissionGate from "../../../routes/PermissionGate";
import { usePermission } from "../../../hooks/usePermission";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useSessionStore from "../../../store/sessionStore";
import useServices from "../hooks/useServices";
import { createService, updateService, changeServiceStatus, toggleSubtask, deleteService } from "../api/serviceApi";
import ServiceCard from "./ServiceCard";
import ServiceFormModal from "./ServiceFormModal";

/**
 * `/services` (§7.72) — internal work items, two columns: To Do and
 * Completed, with counts. ONE page for every role: what differs is what the
 * server returns (admin: everyone's; manager: own team + self; employee: own)
 * and which buttons render (`services.create/edit/delete` gates). The page
 * never filters for visibility itself — it renders the scoped list it is given.
 *
 * No table, no drag-and-drop: a service moves between the two columns with
 * one button, which is also what keeps the page free of horizontal overflow
 * at every width — the columns stack below `lg`.
 */
function ServicesPage() {
  const { message } = App.useApp();
  const currentUser = useSessionStore((state) => state.user);
  const canView = usePermission("services", "view");
  const canEdit = usePermission("services", "edit");
  const [modal, setModal] = useState(null); // { mode: "create" } | { mode: "edit", service }
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { users } = useUserDirectory();
  const { services, isLoading, error, refetch, replaceService } = useServices({ enabled: canView });

  const nameById = useMemo(() => new Map(users.map((user) => [user._id, user.name])), [users]);

  const todo = useMemo(() => services.filter((service) => service.status === "todo"), [services]);
  const completed = useMemo(() => services.filter((service) => service.status === "completed"), [services]);

  // The assignee may always complete their own; an editor may complete anyone's in scope.
  const canComplete = (service) => canEdit || service.assignedToId === currentUser?._id;

  async function handleSubmit(payload) {
    setIsSubmitting(true);

    try {
      if (modal.mode === "edit") {
        await updateService(modal.service._id, payload);
        message.success("Service updated");
      } else {
        await createService(payload);
        message.success("Service created");
      }
      setModal(null);
      refetch();
    } catch (submitError) {
      message.error(submitError.response?.data?.message || "Could not save the service");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleStatus(service) {
    try {
      await changeServiceStatus(service._id, service.status === "completed" ? "todo" : "completed");
      refetch();
    } catch (toggleError) {
      message.error(toggleError.response?.data?.message || "Could not update the status");
    }
  }

  // In place, not a refetch: the list must stay open and the count move
  // 0/2 → 1/2 under the user's cursor.
  async function handleToggleSubtask(service, subtask, isDone) {
    try {
      const response = await toggleSubtask(service._id, subtask._id, isDone);
      replaceService(response.data.data);
    } catch (toggleError) {
      message.error(toggleError.response?.data?.message || "Could not update the subtask");
    }
  }

  async function handleDelete(service) {
    try {
      await deleteService(service._id);
      message.success("Service deleted");
      refetch();
    } catch (deleteError) {
      message.error(deleteError.response?.data?.message || "Could not delete the service");
    }
  }

  if (!canView) {
    return <Result status="403" title="Not authorized" subTitle="You do not have permission to view services." />;
  }

  const renderColumn = (title, items, testId) => (
    <section className="min-w-0 rounded border border-gray-200 bg-gray-50 p-3" data-testid={testId}>
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        {title}
        <Badge count={items.length} showZero color={title === "To Do" ? "#1677ff" : "#52c41a"} />
      </h2>
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={title === "To Do" ? "Nothing to do" : "Nothing completed yet"} />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((service) => (
            <ServiceCard
              key={service._id}
              service={service}
              nameById={nameById}
              canComplete={canComplete(service)}
              onToggleStatus={handleToggleStatus}
              onToggleSubtask={handleToggleSubtask}
              onEdit={(target) => setModal({ mode: "edit", service: target })}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="m-0 text-lg font-semibold">Services</h1>
        <PermissionGate module="services" action="create">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ mode: "create" })}>
            New Service
          </Button>
        </PermissionGate>
      </div>

      {error ? (
        <Alert type="error" showIcon message="Could not load services" description="Please try again." />
      ) : isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Spin />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {renderColumn("To Do", todo, "services-todo")}
          {renderColumn("Completed", completed, "services-completed")}
        </div>
      )}

      <ServiceFormModal
        open={Boolean(modal)}
        mode={modal?.mode || "create"}
        initialService={modal?.service}
        onCancel={() => setModal(null)}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

export default ServicesPage;
