import { Row, Col, Typography } from "antd";
import useSessionStore from "../store/sessionStore";
import { getDashboardWidgetsForRole } from "../modules/dashboard/dashboardConfig";

const { Title, Paragraph } = Typography;

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
 */
function DashboardPage() {
  const user = useSessionStore((state) => state.user);
  const widgets = getDashboardWidgetsForRole(user?.role);

  if (widgets.length === 0) {
    return (
      <div>
        <Title level={3}>Dashboard</Title>
        <Paragraph type="secondary">No dashboard widgets are available for your role yet.</Paragraph>
      </div>
    );
  }

  return (
    <div>
      <Title level={3}>Dashboard</Title>
      <Row gutter={[16, 16]}>
        {widgets.map((Widget, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <Col key={index} xs={24} md={12} xl={8}>
            <Widget />
          </Col>
        ))}
      </Row>
    </div>
  );
}

export default DashboardPage;
