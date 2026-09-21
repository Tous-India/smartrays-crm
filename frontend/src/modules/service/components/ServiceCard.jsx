import { Button, Space, Tag, Tooltip, Typography, Popconfirm } from "antd";
import { CheckOutlined, UndoOutlined, EditOutlined, DeleteOutlined, CalendarOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import PermissionGate from "../../../routes/PermissionGate";
import SubtaskProgress from "./SubtaskProgress";

const { Text } = Typography;

/**
 * One service (§7.72). Assignee AND creator are both always visible — who
 * is doing it and who asked for it are the two questions this card answers.
 *
 * `canComplete` is decided by the PAGE from the record: the assignee may
 * always flip status, and so may anyone holding `services.edit`; the server
 * enforces the same rule (service.service.js#changeServiceStatus), this only
 * decides whether to show the button.
 */
function ServiceCard({ service, nameById, canComplete, onToggleStatus, onToggleSubtask, onEdit, onDelete }) {
  const isDone = service.status === "completed";
  const assignee = nameById.get(service.assignedToId) || "—";
  const creator = nameById.get(service.createdById) || "—";
  const isOverdue = !isDone && service.dueDate && dayjs(service.dueDate).isBefore(dayjs(), "day");

  return (
    <div
      className="rounded border border-gray-200 bg-white p-3 shadow-sm"
      data-testid={`service-card-${service._id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className={`font-medium ${isDone ? "text-gray-500 line-through" : ""}`}>{service.title}</div>
          {service.description && (
            <Text type="secondary" className="block text-xs !mt-1">
              {service.description}
            </Text>
          )}
        </div>
        <Space size={0} className="shrink-0">
          {canComplete && (
            <Tooltip title={isDone ? "Reopen" : "Mark complete"}>
              <Button
                type="text"
                icon={isDone ? <UndoOutlined /> : <CheckOutlined />}
                aria-label={isDone ? "Reopen" : "Mark complete"}
                onClick={() => onToggleStatus(service)}
              />
            </Tooltip>
          )}
          <PermissionGate module="services" action="edit">
            <Tooltip title="Edit">
              <Button type="text" icon={<EditOutlined />} aria-label="Edit service" onClick={() => onEdit(service)} />
            </Tooltip>
          </PermissionGate>
          <PermissionGate module="services" action="delete">
            <Popconfirm title="Delete this service?" okText="Delete" okType="danger" onConfirm={() => onDelete(service)}>
              <Button type="text" danger icon={<DeleteOutlined />} aria-label="Delete service" />
            </Popconfirm>
          </PermissionGate>
        </Space>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
        <span>
          <span className="text-gray-400">Assigned to</span> <span className="font-medium">{assignee}</span>
        </span>
        <span>
          <span className="text-gray-400">by</span> {creator}
        </span>
        {service.dueDate && (
          <Tag color={isOverdue ? "error" : "default"} icon={<CalendarOutlined />} className="!m-0">
            {dayjs(service.dueDate).format("DD MMM")}
          </Tag>
        )}
        {/* Expandable inline; live for the assignee or an editor — the same
            rule as Mark complete. Renders nothing when there are none. */}
        <SubtaskProgress service={service} canToggle={canComplete} onToggle={onToggleSubtask} />
        {isDone && service.completedAt && (
          <span className="text-gray-400">
            done {dayjs(service.completedAt).format("DD MMM, h:mm A")}
            {service.completedById && nameById.get(service.completedById) ? ` by ${nameById.get(service.completedById)}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

export default ServiceCard;
