import { useParams, useNavigate, Link } from "react-router-dom";
import { Spin, Result, Button } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import useCustomerDetail from "../modules/customer/hooks/useCustomerDetail";
import CustomerDetailContent from "../modules/customer/components/CustomerDetailContent";
import { ROUTE_PATHS } from "../constants/routePaths.constants";

/**
 * `/customers/:id` — a real, linkable full page (per leads-customer-
 * functional-spec.md's "Customer Detail Page"), unlike Lead Detail's
 * slide-over. Rendered directly inside MainLayout's content area, no
 * Drawer wrapper.
 */
function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { customer, contacts, contracts, credentials, activity, isLoading, error, refetch } =
    useCustomerDetail(id);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spin size="large" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <Result
        status="404"
        title="Customer not found"
        extra={
          <Link to={ROUTE_PATHS.CUSTOMERS}>
            <Button type="primary">Back to Customers</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <Link to={ROUTE_PATHS.CUSTOMERS} className="mb-4 inline-block">
        <ArrowLeftOutlined /> Back to Customers
      </Link>

      <CustomerDetailContent
        customer={customer}
        contacts={contacts}
        contracts={contracts}
        credentials={credentials}
        activity={activity}
        onChanged={refetch}
        onDeleted={() => navigate(ROUTE_PATHS.CUSTOMERS)}
      />
    </div>
  );
}

export default CustomerDetailPage;
