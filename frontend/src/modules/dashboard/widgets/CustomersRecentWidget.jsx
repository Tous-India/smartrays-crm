import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { List } from "antd";
import { usePermission } from "../../../hooks/usePermission";
import { listCustomers } from "../../customer/api/customerApi";
import WidgetCard from "./WidgetCard";

/**
 * Last few customers created, most-recent first. `listCustomers` already
 * sorts by `createdAt` descending server-side
 * (`backend/src/modules/customer/customer.service.js#listCustomers`), so
 * this just takes the first few — no client-side re-sort needed.
 */
function CustomersRecentWidget() {
  const canView = usePermission("customers", "view");
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canView) {
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    listCustomers({})
      .then((response) => {
        if (!cancelled) {
          setCustomers(response.data.data.slice(0, 5));
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
  }, [canView]);

  if (!canView) {
    return null;
  }

  return (
    <WidgetCard
      title="Recently Added Customers"
      isLoading={isLoading}
      error={error}
      isEmpty={!isLoading && !error && customers.length === 0}
      emptyDescription="No customers yet"
    >
      <List
        size="small"
        dataSource={customers}
        renderItem={(customer) => (
          <List.Item>
            <Link to={`/customers/${customer._id}`}>{customer.companyName}</Link>
          </List.Item>
        )}
      />
    </WidgetCard>
  );
}

export default CustomersRecentWidget;
