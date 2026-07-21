import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Row, Col, Statistic, Tag } from "antd";
import { usePermission } from "../../../hooks/usePermission";
import { listCustomers, listContracts } from "../../customer/api/customerApi";
import {
  CONTRACT_TYPES,
  CONTRACT_TYPE_LABELS,
  CONTRACT_TYPE_COLORS,
} from "../../customer/constants/customer.constants";
import { ROUTE_PATHS } from "../../../constants/routePaths.constants";
import WidgetCard from "./WidgetCard";

/**
 * Total active customers + contract counts by type. There's no aggregated
 * "contracts by type" endpoint on the backend, so this mirrors
 * `useCustomers`'s own precedent (`modules/customer/hooks/useCustomers.js`):
 * fetch every visible active customer's contracts in parallel once the list
 * resolves, deriving real counts instead of a fabricated number.
 */
function CustomersOverviewWidget() {
  const canView = usePermission("customers", "view");
  const [activeCount, setActiveCount] = useState(0);
  const [contractCounts, setContractCounts] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canView) {
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    listCustomers({ status: "active" })
      .then(async (response) => {
        const customers = response.data.data;
        if (cancelled) {
          return;
        }
        setActiveCount(customers.length);

        const contractLists = await Promise.all(
          customers.map((customer) => listContracts(customer._id).then((r) => r.data.data))
        );
        if (cancelled) {
          return;
        }

        const counts = CONTRACT_TYPES.reduce((acc, type) => ({ ...acc, [type]: 0 }), {});
        contractLists.flat().forEach((contract) => {
          if (counts[contract.type] !== undefined) {
            counts[contract.type] += 1;
          }
        });
        setContractCounts(counts);
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
  }, [canView]);

  if (!canView) {
    return null;
  }

  return (
    <WidgetCard title="Customers Overview" isLoading={isLoading} error={error} isEmpty={false}>
      <Row gutter={16}>
        <Col span={12}>
          <Statistic title="Active Customers" value={activeCount} />
        </Col>
      </Row>
      <div className="mt-3 flex flex-wrap gap-2">
        {CONTRACT_TYPES.map((type) => (
          <Tag key={type} color={CONTRACT_TYPE_COLORS[type]}>
            {CONTRACT_TYPE_LABELS[type]}: {contractCounts[type] || 0}
          </Tag>
        ))}
      </div>
      <div className="mt-3 text-right">
        <Link to={ROUTE_PATHS.CUSTOMERS}>View all customers →</Link>
      </div>
    </WidgetCard>
  );
}

export default CustomersOverviewWidget;
