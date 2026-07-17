import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge } from "antd";
import LeadCard from "./LeadCard";
import { LEAD_STATUS_LABELS } from "../constants/lead.constants";

/**
 * One kanban column. `useDroppable` makes the whole column (not just its
 * cards) a valid drop target, so dropping on an empty column — or on empty
 * space below the last card — still registers a move.
 */
function LeadBoardColumn({ status, leads, canDrag }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const leadIds = leads.map((lead) => lead._id);

  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 flex-shrink-0 flex-col rounded-lg border p-2 ${
        isOver ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50"
      }`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="font-medium">{LEAD_STATUS_LABELS[status]}</span>
        <Badge count={leads.length} showZero color="default" />
      </div>

      <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
        <div className="min-h-[40px] flex-1 overflow-y-auto">
          {leads.map((lead) => (
            <LeadCard key={lead._id} lead={lead} canDrag={canDrag} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export default LeadBoardColumn;
