import { Card, Empty, Tag, Space, Button, Tooltip } from "antd";
import { FireFilled, FireOutlined, PhoneOutlined, CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import LeadFollowUpCell from "./LeadFollowUpCell";

const URGENCY_STYLES = {
  overdue: { color: "red", label: "Overdue", borderClass: "border-red-200" },
  today: { color: "gold", label: "Today", borderClass: "border-yellow-200" },
  upcoming: { color: "blue", label: "Upcoming", borderClass: "border-blue-200" },
};

/**
 * Combined Hot Leads + Upcoming Follow-ups row — supersedes the two
 * separate sections this page used to render (see
 * `utils/upcomingFollowUps.js#getPriorityLeads` for the merge/dedupe/sort).
 * Renders every qualifying lead in a fixed-width card grid —
 * `repeat(auto-fill, 256px)`, a genuinely fixed pixel track, not `1fr`
 * tracks, `flex-1`/`basis-64`, or a percentage-based `minmax(24%, 256px)`
 * (briefly tried in between) — so cards are ALWAYS normal/fixed width in
 * every row including the first, and the column COUNT is the only thing
 * that ever changes with viewport width, in clean integer steps. The
 * percentage-based `minmax(24%, 256px)` variant broke visibly at
 * intermediate widths (confirmed ~1281-1455px): once 24% of the
 * container exceeds 256px, CSS Grid's own spec clamps the track's max up
 * to match the min (min may never exceed max), silently turning "fixed at
 * 256px, up to 24%" into "fixed at whatever 24% computes to" — hence
 * exactly 3, oversized, non-256px cards per row there, wide enough that
 * the tag/icon-action row no longer fit on one line and visibly wrapped/
 * overlapped inside the card. A fixed pixel track has no such threshold to
 * cross, so it can't reproduce this failure mode at any width. A row with
 * fewer than 4 cards (whether it's the only row or a wrapped one) simply
 * leaves the remaining slots empty rather than stretching its cards to
 * fill them; an earlier pass made partial rows stretch, which read as
 * visually wrong for a lone card and was reverted back to this fixed-width
 * behavior. No "+N more" cap: this list is bounded by "hot" + "due in the
 * next 3 days", not by total lead count.
 *
 * Each card also carries a row of icon-only quick actions — Log Call,
 * Reschedule, Won, Lost, Mark/Remove Hot — every one of them wired to the
 * exact same handlers/modals `LeadsListPage` already built for the Table
 * view (`onLogCall`/`onRescheduleFollowUp`/`onRequestStatusChange`/
 * `onToggleHot`, passed straight through as props), not new logic: Log Call
 * opens the same `LogCallModal`, Won/Lost go through the same
 * `useLeadStatusChangeFlow` (Won opens `ConvertToCustomerModal` — status
 * only actually changes on a successful conversion; Lost opens
 * `LostReasonModal`), Reschedule reuses `LeadFollowUpCell` itself
 * (`iconOnly`) rather than a second date-picking implementation, and hot
 * toggle calls the same `toggleHotFlag`-based handler the Lead Detail page
 * uses — deliberately not `updateLead`, which silently no-ops on `isHot`
 * since that field was never in its updatable-fields allow-list (the exact
 * bug `LeadDetailPage.jsx` itself already found and fixed). Every handler
 * this section already receives ends in the same `refetch()` call
 * `LeadsListPage` uses for the Table/Board views, so a card whose action
 * changes its qualifying status (e.g. Lost) disappears from this section
 * exactly like it would from the underlying list — no separate refresh
 * wiring needed here.
 */
function PriorityLeadsSection({
  priorityLeads,
  onLogCall,
  onRescheduleFollowUp,
  onRequestStatusChange,
  onToggleHot,
}) {
  const navigate = useNavigate();

  return (
    <div className="mb-4 bg-[#E8F1FB] p-1.25 rounded-[7px]">
      <h3 className="mb-2 text-sm font-semibold text-gray-700 p-[10px] pb-0">Needs Attention</h3>

      {priorityLeads.length === 0 ? (
        <Card size="small">
          <Empty
            description="No hot leads or follow-ups due in the next 3 days"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,256px)] gap-3 p-[10px]">
          {priorityLeads.map((lead) => {
            const urgency = lead.followUpUrgency ? URGENCY_STYLES[lead.followUpUrgency] : null;

            return (
              <Card
                key={lead._id}
                size="small"
                hoverable
                className={`cursor-pointer ${urgency ? urgency.borderClass : "border-orange-200"}`}
                onClick={() => navigate(`/leads/${lead._id}`)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 font-medium">
                    {/* `style` for color, not a Tailwind className — AntD's
                        `Card` sets its own text color that a plain utility
                        class loses to (same issue found and fixed
                        everywhere else this icon appears). Shown alongside
                        the "Hot" tag below, not instead of it — the icon is
                        a quick glance cue in the header, the tag is the
                        explicit label. */}
                    {lead.isHot && <FireFilled style={{ color: "#fa8c16" }} title="Hot lead" />}
                    {lead.name}
                  </span>
                  {lead.followUpDate && (
                    <span className="whitespace-nowrap text-xs text-gray-500">
                      {new Date(lead.followUpDate).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500">{lead.companyName || "—"}</div>
                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    {lead.isHot && <Tag color="orange">Hot</Tag>}
                    {urgency && <Tag color={urgency.color}>{urgency.label}</Tag>}
                  </div>

                  <Space size={0}>
                    <Tooltip title="Log Call">
                      <Button
                        type="text"
                        size="small"
                        icon={<PhoneOutlined />}
                        aria-label="Log Call"
                        onClick={(event) => {
                          event.stopPropagation();
                          onLogCall(lead);
                        }}
                      />
                    </Tooltip>
                    <LeadFollowUpCell lead={lead} onReschedule={onRescheduleFollowUp} iconOnly />
                    <Tooltip title="Won">
                      <Button
                        type="text"
                        size="small"
                        icon={<CheckCircleOutlined />}
                        aria-label="Won"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRequestStatusChange(lead, "won");
                        }}
                      />
                    </Tooltip>
                    <Tooltip title="Lost">
                      <Button
                        type="text"
                        size="small"
                        icon={<CloseCircleOutlined />}
                        aria-label="Lost"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRequestStatusChange(lead, "lost");
                        }}
                      />
                    </Tooltip>
                    <Tooltip title={lead.isHot ? "Remove Hot" : "Mark as Hot"}>
                      <Button
                        type="text"
                        size="small"
                        icon={
                          lead.isHot ? (
                            <FireFilled style={{ color: "#fa8c16" }} />
                          ) : (
                            <FireOutlined style={{ color: "#bfbfbf" }} />
                          )
                        }
                        aria-label={lead.isHot ? "Remove Hot" : "Mark as Hot"}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleHot(lead);
                        }}
                      />
                    </Tooltip>
                  </Space>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PriorityLeadsSection;
