import { LEAD_STATUSES } from "../constants/lead.constants";

/**
 * Pure decision logic for a dnd-kit `onDragEnd` event: which lead was
 * dragged, and which column did it land in? Extracted out of LeadBoard.jsx
 * so it's directly unit-testable — simulating real pointer-drag sequences
 * through dnd-kit under jsdom is notoriously brittle/flaky, so this is
 * tested as a plain function instead (see resolveDropDestination.test.js).
 *
 * `overId` is either a column's own id (dropped on empty space in that
 * column) or another card's id (dropped on/near a card) — the latter is
 * resolved to whichever column that card belongs to. Returns `null` if
 * there's nothing to do (dropped outside any target, or back on its own
 * column).
 */
export function resolveDropDestination(leads, activeId, overId) {
  if (overId == null) {
    return null;
  }

  const draggedLead = leads.find((lead) => lead._id === activeId);

  if (!draggedLead) {
    return null;
  }

  const destinationStatus = LEAD_STATUSES.includes(overId)
    ? overId
    : leads.find((lead) => lead._id === overId)?.status;

  if (!destinationStatus || destinationStatus === draggedLead.status) {
    return null;
  }

  return { lead: draggedLead, destinationStatus };
}

export default resolveDropDestination;
