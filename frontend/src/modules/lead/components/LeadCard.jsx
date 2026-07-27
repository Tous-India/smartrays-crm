import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "antd";
import { FireFilled } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

function isOverdue(followUpDate) {
  return followUpDate && new Date(followUpDate) < new Date();
}

/**
 * One kanban card, draggable via `@dnd-kit/sortable`'s `useSortable` (gives
 * us the drag handle + drop animation for free). Clicking a card (rather
 * than dragging it) opens the lead's detail slide-over, same as a table row.
 */
function LeadCard({ lead, canDrag }) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead._id,
    disabled: !canDrag,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Dragging is a `leads.edit` action (it calls the same status-change
  // endpoint the Table dropdown does) — a viewer with no edit grant only
  // gets the click-to-open-detail interaction, not the drag handle.
  const dragProps = canDrag ? { ...attributes, ...listeners } : {};

  return (
    <div ref={setNodeRef} style={style} {...dragProps}>
      <Card
        size="small"
        className={`mb-2 ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
        onClick={() => navigate(`/leads/${lead._id}`)}
      >
        <div className="flex items-center justify-between">
          <span className="font-medium">{lead.name}</span>
          {/* `style` for color, not a Tailwind className — AntD's `Card`
              sets its own text color that a plain utility class loses to
              (same issue found and fixed everywhere else this icon
              appears). */}
          {lead.isHot && <FireFilled style={{ color: "#fa8c16" }} title="Hot lead" />}
        </div>
        {lead.companyName && <div className="text-xs text-gray-500">{lead.companyName}</div>}
        {lead.budget != null && (
          <div className="text-xs text-gray-500">Budget: {lead.budget.toLocaleString()}</div>
        )}
        {lead.followUpDate && (
          <div className={`text-xs ${isOverdue(lead.followUpDate) ? "font-medium text-red-600" : "text-gray-500"}`}>
            Follow-up: {new Date(lead.followUpDate).toLocaleDateString()}
          </div>
        )}
      </Card>
    </div>
  );
}

export default LeadCard;
