import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Alert, Card, Table, Tag, Typography } from "antd";
import { fetchLocationConsents } from "../api/locationApi";

const { Text } = Typography;

/**
 * Who has agreed to shift tracking (§7.73). Lives on the Live Map tab, next
 * to the tracking it governs: an admin sees every field employee, a manager
 * their own team — the same scope as the map — including the people who have
 * never answered, because the gap is the thing to chase. The decision is
 * whatever the app recorded on the disclosure screen; nothing is editable
 * here.
 */
const DECISION_TAGS = {
  granted: { color: "green", label: "Granted" },
  declined: { color: "red", label: "Declined" },
};

function LocationConsentPanel() {
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    fetchLocationConsents()
      .then((response) => {
        if (!cancelled) {
          setRows(response.data.data);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const columns = [
    { title: "Employee", dataIndex: "name", key: "name" },
    {
      title: "Tracking consent",
      dataIndex: "decision",
      key: "decision",
      render: (decision) => {
        const tag = DECISION_TAGS[decision];

        return tag ? <Tag color={tag.color}>{tag.label}</Tag> : <Tag>Not answered</Tag>;
      },
    },
    {
      title: "Recorded",
      dataIndex: "recordedAt",
      key: "recordedAt",
      render: (recordedAt) => (recordedAt ? dayjs(recordedAt).format("DD MMM YYYY, HH:mm") : "—"),
    },
    {
      title: "Disclosure version",
      dataIndex: "disclosureVersion",
      key: "disclosureVersion",
      render: (version) => version || "—",
    },
    {
      title: "App",
      dataIndex: "appVersion",
      key: "appVersion",
      render: (version) => version || "—",
    },
  ];

  return (
    <Card
      size="small"
      className="app-elevated-card"
      data-testid="location-consent-panel"
      title={
        <div className="flex flex-wrap items-baseline gap-2">
          <span>Location tracking consent</span>
          <Text type="secondary" className="text-xs font-normal">
            the latest answer each person gave the app&apos;s disclosure
          </Text>
        </div>
      }
    >
      {error ? (
        <Alert type="error" showIcon message="Could not load consent records" />
      ) : (
        <Table
          rowKey="employeeId"
          size="small"
          columns={columns}
          dataSource={rows}
          loading={isLoading}
          pagination={false}
          scroll={{ x: "max-content" }}
        />
      )}
    </Card>
  );
}

export default LocationConsentPanel;
