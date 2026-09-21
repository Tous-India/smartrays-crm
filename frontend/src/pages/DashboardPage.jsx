import { useLayoutEffect, useRef, useState } from "react";
import { Row, Col, Typography } from "antd";
import useSessionStore from "../store/sessionStore";
import { getDashboardWidgetsForRole } from "../modules/dashboard/dashboardConfig";

const { Title, Paragraph } = Typography;

const NO_WIDGETS_MESSAGE = "No dashboard widgets are available for your role yet.";

/**
 * `/dashboard` — one shared shell per §7.13, composing widgets by role +
 * permission rather than branching into separate per-role dashboard pages
 * (mirrors `MainLayout`'s own nav-by-permission precedent). The role →
 * widget list itself lives in `dashboardConfig.js`; this page just looks up
 * the current user's candidate list and renders each widget in a responsive
 * grid. Every widget independently re-verifies its own permission before
 * rendering anything (see `dashboardConfig.js`'s comment) and fetches/
 * handles its own loading/error/empty state, so one widget's API failing
 * can never blank the rest of the page.
 *
 * TWO WAYS TO END UP WITH NOTHING, ONE MESSAGE (§7.72). The candidate list
 * can be empty for a role — or it can be non-empty and every candidate can
 * self-gate to `null`, which is what an employee without `services.view`
 * hit the day the first employee widget was added: the page had candidates,
 * so the old `widgets.length === 0` check never fired, and the user got a
 * blank page. The page now also measures what its grid actually painted.
 * Widgets keep self-gating and keep returning `null`; the page just notices.
 *
 * Measured from the DOM on purpose, not from the catalog: the catalog cannot
 * know a widget's decision without duplicating every widget's permission
 * logic, and that duplication is exactly what self-gating exists to avoid.
 * A `useLayoutEffect` runs before paint, so the message appears in the same
 * frame as the (empty) grid — no flash of blank page first.
 */
function DashboardPage() {
  const user = useSessionStore((state) => state.user);
  const widgets = getDashboardWidgetsForRole(user?.role);
  const gridRef = useRef(null);
  // null until measured, so the message is never shown on a frame the grid
  // has not been inspected yet.
  const [paintedCount, setPaintedCount] = useState(null);

  useLayoutEffect(() => {
    if (!gridRef.current) {
      setPaintedCount(0);
      return;
    }

    // A widget that rendered null leaves its Col with no children at all;
    // one that rendered anything (a card, a spinner, an error) fills it.
    const cols = gridRef.current.querySelectorAll(":scope > .ant-col");
    const painted = [...cols].filter((col) => col.childElementCount > 0).length;
    setPaintedCount(painted);
  });

  const nothingToShow = widgets.length === 0 || paintedCount === 0;

  return (
    <div>
      <Title level={3}>Dashboard</Title>
      {nothingToShow && <Paragraph type="secondary">{NO_WIDGETS_MESSAGE}</Paragraph>}
      {widgets.length > 0 && (
        // Tighter gutter (was [16, 16]) per the UI/UX pass — these are
        // glance-summary cards now, a looser grid reads as more empty
        // padding rather than more content. Always rendered when there are
        // candidates, even if they all paint nothing: it is what gets measured.
        <Row gutter={[12, 12]} ref={gridRef} data-testid="dashboard-grid">
          {widgets.map((Widget, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <Col key={index} xs={24} md={12} xl={8}>
              <Widget />
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}

export default DashboardPage;
