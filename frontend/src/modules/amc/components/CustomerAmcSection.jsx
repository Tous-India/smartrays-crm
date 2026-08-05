import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Card, Col, Row, Tag, Button, Empty, Spin, Space, Typography, Tooltip, App } from "antd";
import { ReloadOutlined, HistoryOutlined } from "@ant-design/icons";
import PermissionGate from "../../../routes/PermissionGate";
import AmcRenewModal from "./AmcRenewModal";
import { listAmcForCustomer, renewAmc } from "../api/amcApi";

const { Text } = Typography;

/**
 * AMC on the Customer Detail page (2026-08-05) — replaces the standalone
 * `/amc` page, which is deleted. AMC only ever made sense per-customer, and
 * a separate top-level page meant leaving the customer you were looking at
 * to check their contract.
 *
 * **One card per CURRENT term, not per record.** Renewals chain via
 * `previousAmcId`, so a customer renewed three times has four records but
 * should still read as ONE ongoing AMC. `buildChains` below walks the links
 * and renders only each chain's head, with past terms folded into an
 * expandable "Renewed N×" line rather than competing for attention as
 * top-level cards of their own.
 *
 * **Four per row** (`xl={6}`), stepping down through `lg`/`sm` so cards stay
 * readable rather than shrinking to four cramped columns on a tablet.
 *
 * `isExpiringSoon` is taken verbatim from the API — the 30-day threshold is
 * defined once in `amc.service.js#decorateAMC` and deliberately not
 * recomputed here, so the two can never disagree about what "soon" means.
 */
function CustomerAmcSection({ customerId }) {
  const { message } = App.useApp();
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [renewTarget, setRenewTarget] = useState(null);
  const [isRenewing, setIsRenewing] = useState(false);
  const [expandedChainId, setExpandedChainId] = useState(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await listAmcForCustomer(customerId);
      setRecords(response.data.data);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const chains = useMemo(() => buildChains(records), [records]);

  async function handleRenew(payload) {
    setIsRenewing(true);

    try {
      await renewAmc(renewTarget._id, payload);
      message.success("AMC renewed — a new term has been created");
      setRenewTarget(null);
      refetch();
    } catch (renewError) {
      message.error(renewError.response?.data?.message || "Could not renew this AMC — please try again.");
    } finally {
      setIsRenewing(false);
    }
  }

  return (
    <Card title="AMC" className="mb-6 app-elevated-card">
      {isLoading && (
        <div className="flex justify-center py-6">
          <Spin />
        </div>
      )}

      {!isLoading && error && (
        <Empty description="Could not load AMC records. Please try again." />
      )}

      {!isLoading && !error && chains.length === 0 && (
        <Empty description="No AMC records for this customer" />
      )}

      {!isLoading && !error && chains.length > 0 && (
        <Row gutter={[16, 16]}>
          {chains.map(({ current, history }) => (
            <Col key={current._id} xs={24} sm={12} lg={8} xl={6}>
              <AmcStatCard
                amc={current}
                history={history}
                isExpanded={expandedChainId === current._id}
                onToggleHistory={() =>
                  setExpandedChainId(expandedChainId === current._id ? null : current._id)
                }
                onRenew={() => setRenewTarget(current)}
              />
            </Col>
          ))}
        </Row>
      )}

      <AmcRenewModal
        open={Boolean(renewTarget)}
        amc={renewTarget}
        onCancel={() => setRenewTarget(null)}
        onSubmit={handleRenew}
        isSubmitting={isRenewing}
      />
    </Card>
  );
}

function AmcStatCard({ amc, history, isExpanded, onToggleHistory, onRenew }) {
  const isExpired = amc.status === "expired";
  const isExpiringSoon = Boolean(amc.isExpiringSoon);

  // Three visually distinct states, deliberately not two: "expiring soon" is
  // an amber call to ACT (still live, running out), whereas "expired" is a
  // neutral-red statement of fact about a term that already ended. Rendering
  // them alike would bury the one that needs attention.
  const accentClass = isExpiringSoon
    ? "border-amber-400 bg-amber-50"
    : isExpired
      ? "border-gray-200 bg-gray-50"
      : "border-gray-200";

  return (
    <div className={`h-full rounded-lg border p-4 ${accentClass}`} data-testid={`amc-card-${amc._id}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <Text className="text-xl font-semibold">
          {amc.amount != null ? `₹${amc.amount.toLocaleString()}` : "—"}
        </Text>
        {isExpiringSoon ? (
          <Tag color="warning">Expiring soon</Tag>
        ) : (
          <Tag color={isExpired ? "default" : "green"}>{isExpired ? "Expired" : "Active"}</Tag>
        )}
      </div>

      <div className="text-xs text-gray-500">
        <div>Start: {dayjs(amc.startDate).format("DD MMM YYYY")}</div>
        <div>Renews: {dayjs(amc.renewalDate).format("DD MMM YYYY")}</div>
      </div>

      {history.length > 0 && (
        <div className="mt-2">
          <Button type="link" size="small" className="!px-0" icon={<HistoryOutlined />} onClick={onToggleHistory}>
            {`Renewed ${history.length}×`}
          </Button>

          {isExpanded && (
            <div className="mt-1 border-t pt-1" data-testid={`amc-history-${amc._id}`}>
              {history.map((term) => (
                <div key={term._id} className="text-xs text-gray-500">
                  {dayjs(term.startDate).format("MMM YYYY")} – {dayjs(term.renewalDate).format("MMM YYYY")}
                  {term.amount != null && ` · ₹${term.amount.toLocaleString()}`}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Same `amc.edit` grant that already gates PATCH /amc/:id — renewing
          is a management action on the record, not a new capability, so no
          new permission key was invented for it. */}
      <PermissionGate module="amc" action="edit">
        <Space className="mt-3">
          <Tooltip title={isExpired ? "Start a new term from where this one ended" : "Start the next term"}>
            <Button size="small" icon={<ReloadOutlined />} onClick={onRenew}>
              Renew
            </Button>
          </Tooltip>
        </Space>
      </PermissionGate>
    </div>
  );
}

/**
 * Groups flat AMC records into renewal chains, returning one entry per chain
 * with its CURRENT term plus that term's past terms, newest first.
 *
 * A chain's head is the record nothing else points at via `previousAmcId` —
 * i.e. the term that has not itself been renewed. Records whose predecessor
 * isn't in the fetched set (possible if scoping hid it) still head their own
 * chain rather than vanishing, so nothing is ever silently dropped from the
 * page.
 */
export function buildChains(records) {
  const byId = new Map(records.map((record) => [String(record._id), record]));
  const supersededIds = new Set(
    records.map((record) => record.previousAmcId && String(record.previousAmcId)).filter(Boolean)
  );

  return records
    .filter((record) => !supersededIds.has(String(record._id)))
    .map((current) => {
      const history = [];
      let cursor = current.previousAmcId ? byId.get(String(current.previousAmcId)) : null;

      // Guard against a cycle in the data rather than hanging the page.
      const seen = new Set([String(current._id)]);

      while (cursor && !seen.has(String(cursor._id))) {
        seen.add(String(cursor._id));
        history.push(cursor);
        cursor = cursor.previousAmcId ? byId.get(String(cursor.previousAmcId)) : null;
      }

      return { current, history };
    })
    .sort((a, b) => new Date(b.current.renewalDate) - new Date(a.current.renewalDate));
}

export default CustomerAmcSection;
