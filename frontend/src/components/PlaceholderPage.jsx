import { Typography } from "antd";

const { Title, Paragraph } = Typography;

/**
 * Shared "coming soon" shell for every route not yet built out beyond its
 * routing skeleton (§10 — modules are built phase-by-phase, mirroring the
 * backend). Each route still gets its own page file per the modules/pages
 * convention; they just render this until that module's frontend task lands.
 */
function PlaceholderPage({ title }) {
  return (
    <div>
      <Title level={3}>{title}</Title>
      <Paragraph type="secondary">This page is coming soon.</Paragraph>
    </div>
  );
}

export default PlaceholderPage;
