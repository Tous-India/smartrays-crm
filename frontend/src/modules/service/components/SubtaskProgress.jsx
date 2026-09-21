import { useState } from "react";
import { Checkbox } from "antd";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import { subtaskProgress } from "../serviceUrgency";

/**
 * The "1/2 subtasks" count, made real (§7.72). Click it and the list unfolds
 * inline — no modal, it is a quick working action — with a checkbox per
 * subtask. Whether the checkboxes are live is the caller's decision
 * (`canToggle`): the assignee and anyone holding `services.edit`, the same
 * rule as Mark complete, and the same rule the server enforces.
 *
 * Renders NOTHING for a service with no subtasks — no affordance, no empty
 * panel. Used by the service card on /services and by the My Services widget.
 */
function SubtaskProgress({ service, canToggle, onToggle, busySubtaskId = null }) {
  const [isOpen, setIsOpen] = useState(false);
  const progress = subtaskProgress(service);

  if (!progress) {
    return null;
  }

  const panelId = `subtasks-${service._id}`;

  return (
    <div className="min-w-0">
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded px-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? <DownOutlined className="text-[10px]" /> : <RightOutlined className="text-[10px]" />}
        {progress.done}/{progress.total} subtasks
      </button>

      {isOpen && (
        <ul id={panelId} className="m-0 mt-1 list-none p-0" data-testid={`subtask-list-${service._id}`}>
          {service.subtasks.map((subtask) => (
            <li key={subtask._id} className="flex min-w-0 items-start gap-2 py-0.5">
              <Checkbox
                checked={subtask.isDone}
                disabled={!canToggle || busySubtaskId === subtask._id}
                aria-label={subtask.title}
                onChange={(event) => onToggle(service, subtask, event.target.checked)}
              />
              <span className={`min-w-0 break-words text-sm ${subtask.isDone ? "text-gray-400 line-through" : ""}`}>
                {subtask.title}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SubtaskProgress;
