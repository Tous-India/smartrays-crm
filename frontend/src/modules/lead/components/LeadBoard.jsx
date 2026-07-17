import { DndContext, PointerSensor, useSensor, useSensors, closestCorners } from "@dnd-kit/core";
import LeadBoardColumn from "./LeadBoardColumn";
import { LEAD_STATUSES } from "../constants/lead.constants";
import { resolveDropDestination } from "../utils/resolveDropDestination";

/**
 * Kanban Board View per leads-customer-functional-spec.md: one column per
 * pipeline stage, drag a card to move it between stages. `onRequestChange`
 * is `useLeadStatusChangeFlow`'s dispatcher — dropping on `lost` opens the
 * reason modal, dropping on `won` opens the Convert-to-Customer modal,
 * everything else changes status immediately (see that hook).
 */
function LeadBoard({ leads, canEdit, onRequestStatusChange }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const leadsByStatus = LEAD_STATUSES.reduce((groups, status) => {
    groups[status] = leads.filter((lead) => lead.status === status);
    return groups;
  }, {});

  function handleDragEnd(event) {
    if (!canEdit) {
      return;
    }

    const { active, over } = event;
    const destination = resolveDropDestination(leads, active.id, over?.id);

    if (!destination) {
      return;
    }

    onRequestStatusChange(destination.lead, destination.destinationStatus);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {LEAD_STATUSES.map((status) => (
          <LeadBoardColumn key={status} status={status} leads={leadsByStatus[status]} canDrag={canEdit} />
        ))}
      </div>
    </DndContext>
  );
}

export default LeadBoard;
