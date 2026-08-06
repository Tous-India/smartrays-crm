import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Badge, Button, Collapse, Space, Table, Tag, Tooltip, App } from "antd";
import { ReloadOutlined, WarningOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import PermissionGate from "../../../routes/PermissionGate";
import AmcRenewModal from "./AmcRenewModal";
import { listExpiringAmc, renewAmc } from "../api/amcApi";
import { ROUTE_PATHS } from "../../../constants/routePaths.constants";

/**
 * Renewals due, above the Customers table (§7.42, 2026-08-06) — so a renewal
 * is visible without opening each customer in turn.
 *
 * **Deliberately NOT the four-across card grid** `CustomerAmcSection` uses.
 * That grid answers "what does THIS customer's contract look like", where a
 * card per term with amount and history earns its space. This answers "whose
 * renewals need action", which is a worklist: one dense row per record,
 * scannable top to bottom, sorted most-urgent-first by the server. Rendering
 * both the same way would invite reading one as the other — the same mistake
 * the Timeline and Location columns made by both being bars.
 *
 * **Hidden entirely when nothing is due.** An empty panel permanently above
 * the table is clutter that trains people to ignore the space. Nothing
 * renders — not a collapsed shell, not an empty state.
 *
 * `customerName` arrives on each record from the same query that fetched it
 * (`amc.service.js#listAMC` populates it), so this panel costs ONE request
 * no matter how many rows it shows. The Customers table below already fires
 * a contracts request per row; this must not add a second N+1.
 */
function ExpiringAmcPanel() {
  const { message } = App.useApp();
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [renewTarget, setRenewTarget] = useState(null);
  const [isRenewing, setIsRenewing] = useState(false);

  const refetch = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await listExpiringAmc();
      setRecords(response.data.data || []);
    } catch {
      // A failure here must not take the Customers page down with it — the
      // table below is the primary content and stands on its own.
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const overdueCount = useMemo(
    () => records.filter((record) => daysRemaining(record) < 0).length,
    [records]
  );

  async function handleRenew(payload) {
    setIsRenewing(true);

    try {
      // The same POST /amc/:id/renew the Customer Detail page uses — there is
      // one renew path, not two.
      await renewAmc(renewTarget._id, payload);
      message.success("AMC renewed — a new term has been created");
      setRenewTarget(null);
      // Refetch rather than splice locally: renewing marks the old record
      // expired, so the server no longer returns it and the row leaves on its
      // own. Removing it by hand would duplicate that rule in a second place.
      refetch();
    } catch (error) {
      message.error(error.response?.data?.message || "Could not renew this AMC — please try again.");
    } finally {
      setIsRenewing(false);
    }
  }

  // Nothing due — render nothing at all.
  if (isLoading || records.length === 0) {
    return null;
  }

  const columns = [
    {
      title: "Customer",
      dataIndex: "customerName",
      render: (customerName, record) =>
        record.customerId ? (
          <Link to={`${ROUTE_PATHS.CUSTOMERS}/${record.customerId}`}>{customerName || "Unknown"}</Link>
        ) : (
          customerName || "Unknown"
        ),
    },
    {
      title: "Renews",
      dataIndex: "renewalDate",
      render: (renewalDate) => dayjs(renewalDate).format("DD MMM YYYY"),
    },
    {
      title: "Amount",
      dataIndex: "amount",
      align: "right",
      render: (amount) => (amount != null ? `₹${amount.toLocaleString()}` : "—"),
    },
    {
      title: "Status",
      key: "remaining",
      render: (_, record) => <RemainingTag record={record} />,
    },
    {
      title: "",
      key: "actions",
      align: "right",
      render: (_, record) => (
        // The same `amc.edit` grant that gates the Customer Detail page's own
        // Renew button and PATCH /amc/:id. No new permission key.
        <PermissionGate module="amc" action="edit">
          <Tooltip title="Start the next term">
            <Button
              size="small"
              icon={<ReloadOutlined />}
              data-testid={`renew-${record._id}`}
              onClick={() => setRenewTarget(record)}
            >
              Renew
            </Button>
          </Tooltip>
        </PermissionGate>
      ),
    },
  ];

  return (
    <div className="mb-4" data-testid="expiring-amc-panel">
      <Collapse
        defaultActiveKey={["renewals"]}
        items={[
          {
            key: "renewals",
            label: (
              <Space size={8}>
                <WarningOutlined className={overdueCount > 0 ? "text-red-500" : "text-amber-500"} />
                <span className="font-medium">Renewals due</span>
                {/* The count stays visible when collapsed — the whole point
                    of the panel is that it is noticed without being opened. */}
                <Badge
                  count={records.length}
                  data-testid="expiring-amc-count"
                  style={{ backgroundColor: overdueCount > 0 ? "#cf1322" : "#d48806" }}
                />
                {overdueCount > 0 && (
                  <span className="text-xs text-red-600">{overdueCount} overdue</span>
                )}
              </Space>
            ),
            children: (
              <Table
                rowKey="_id"
                size="small"
                className="app-data-table"
                columns={columns}
                dataSource={records}
                pagination={false}
              />
            ),
          },
        ]}
      />

      <AmcRenewModal
        open={Boolean(renewTarget)}
        amc={renewTarget}
        onCancel={() => setRenewTarget(null)}
        onSubmit={handleRenew}
        isSubmitting={isRenewing}
      />
    </div>
  );
}

/** Whole days until renewal; negative once the date has passed. */
export function daysRemaining(record, now = new Date()) {
  return dayjs(record.renewalDate).startOf("day").diff(dayjs(now).startOf("day"), "day");
}

/**
 * Overdue and expiring-soon are visually distinct on purpose: one is a
 * deadline approaching, the other a commitment already lapsed.
 */
function RemainingTag({ record }) {
  const days = daysRemaining(record);

  if (days < 0) {
    const overdueBy = Math.abs(days);
    return (
      <Tag color="error" data-testid={`remaining-${record._id}`}>
        {`Overdue by ${overdueBy} day${overdueBy === 1 ? "" : "s"}`}
      </Tag>
    );
  }

  if (days === 0) {
    return (
      <Tag color="warning" data-testid={`remaining-${record._id}`}>
        Due today
      </Tag>
    );
  }

  return (
    <Tag color="warning" data-testid={`remaining-${record._id}`}>
      {`${days} day${days === 1 ? "" : "s"} left`}
    </Tag>
  );
}

export default ExpiringAmcPanel;
