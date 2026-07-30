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
 * Renders every qualifying lead in a proportional-column grid —
 * `grid-template-columns: repeat(4, 1fr)` at desktop widths (Tailwind's
 * `grid-cols-4` utility, which already compiles to exactly
 * `repeat(4, minmax(0, 1fr))` — functionally identical to plain `1fr`
 * tracks for sizing purposes), NOT a fixed pixel track
 * (`repeat(auto-fill, 256px)`, tried immediately before this) or `flex-1`/
 * `basis-64`. The fixed-pixel version fixed an earlier percentage-based
 * `minmax()` bug (see below) but reintroduced the ORIGINAL complaint this
 * section started with: a full row of cards didn't span the container's
 * full width, since `auto-fill` sizes columns to the literal 256px value
 * regardless of how much space is actually available, leaving a
 * leftover strip on the right unless the container width happens to be an
 * exact multiple of 256px + gap. `1fr` columns don't have that problem —
 * a full row of 4 always divides 100% of the container into 4 equal
 * shares, with no remainder. A PARTIAL row (1-3 cards) still doesn't
 * stretch under `1fr` either: grid track sizing is a property of the grid
 * itself (always 4 equal-width columns, however many are actually
 * occupied), not of how many items got placed into it — an item placed in
 * column 1 of a 4-column grid renders at that column's own 1fr width
 * whether columns 2-4 hold other cards or nothing at all, so unused
 * columns in a partial row stay genuinely empty rather than the placed
 * cards growing to fill them (that redistribution is a `flex-grow`
 * behavior, which is exactly why the earlier `flex-1`/`basis-64` attempt
 * DID stretch and had to be reverted — plain CSS Grid tracks never do
 * this). Responsive column count (`grid-cols-1 sm:grid-cols-2
 * lg:grid-cols-4`, not an unconditional 4 all the way down to mobile) is a
 * deliberate deviation from a literal "always 4" reading: at genuinely
 * narrow widths 4 columns would give each card far too little room for
 * its own content (name/date, tags, 5 icon buttons) and reproduce the
 * exact overflow-inside-the-card failure already fixed twice this session
 * for other reasons — scaling the column count down first, while keeping
 * every step's tracks proportional (never fixed-px), avoids that without
 * giving up "fills the full row, doesn't stretch a partial one" at any
 * single breakpoint. The percentage-based `minmax(24%, 256px)` variant
 * (tried between the two fixed-width passes) broke visibly at
 * intermediate widths (confirmed ~1281-1455px): once 24% of the container
 * exceeds 256px, CSS Grid's own spec clamps the track's max up to match
 * the min (min may never exceed max), silently turning "fixed at 256px,
 * up to 24%" into "fixed at whatever 24% computes to" — exactly 3,
 * oversized, non-256px cards per row there, wide enough that the
 * tag/icon-action row no longer fit on one line and visibly wrapped/
 * overlapped inside the card. Plain `1fr` (or Tailwind's `minmax(0,1fr)`)
 * tracks have no such competing min/max to cross, so they can't reproduce
 * that failure mode at any width. No "+N more" cap: this list is bounded
 * by "hot" + "due in the next 3 days", not by total lead count.
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
 *
 * Card layout is a strict vertical stack, each row getting the card's full
 * width rather than sharing it: (1) name + date/time, (2) company, (3) the
 * Hot/urgency tags, (4) the icon action row, left-aligned, pinned at the
 * bottom. The tags and the icon row used to share one `justify-between`
 * line — fine when only one tag was present, but a card with BOTH a Hot
 * tag AND a follow-up urgency tag at once (the actual worst case: a hot
 * lead that also has a near-term follow-up) left too little width for the
 * 5 icon buttons on that same line, overflowing the card's fixed 256px
 * width. Splitting the tags and the icon row onto their own dedicated rows
 * fixes this for every combination, since Card has no fixed/max height —
 * it already grows to fit however many rows are actually present.
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
        <div className="grid grid-cols-1 gap-3 p-[10px] sm:grid-cols-2 lg:grid-cols-4">
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

                {(lead.isHot || urgency) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {lead.isHot && <Tag color="orange">Hot</Tag>}
                    {urgency && <Tag color={urgency.color}>{urgency.label}</Tag>}
                  </div>
                )}

                <div className="mt-1.5 flex items-center justify-start">
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
