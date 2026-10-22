import { Result } from "antd";
import CustomersListPage from "../modules/customer/components/CustomersListPage";
import { usePermission } from "../hooks/usePermission";

/**
 * Checks customers.view BEFORE the list mounts (2026-10-22): someone without
 * it (an employee typing the address) used to get an empty table and two
 * refused API calls; now they get the same "Not authorized" page Payments
 * shows, and nothing is requested.
 */
function CustomersPage() {
  const canView = usePermission("customers", "view");

  if (!canView) {
    return <Result status="403" title="Not authorized" subTitle="You do not have permission to view customers." />;
  }

  return <CustomersListPage />;
}

export default CustomersPage;
