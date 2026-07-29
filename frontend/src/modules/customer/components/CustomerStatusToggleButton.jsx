import { Button, Popconfirm, message } from "antd";
import { StopOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { updateCustomer } from "../api/customerApi";

/**
 * The single Deactivate/Activate control — reused by both the Customer
 * Detail header and the List table's Actions column, so there is exactly
 * one place calling `PATCH /customers/:id` with the flipped `customerStatus`
 * and exactly one place owning the Popconfirm's consequence text, rather
 * than two copies that could quietly drift apart. Deactivating shows a
 * confirmation naming its real, non-obvious side effect (completes every
 * active project for this customer, `customer.service.js#updateCustomer`);
 * reactivating has no such side effect and needs none.
 */
function CustomerStatusToggleButton({ customer, onChanged, size }) {
  const isActive = customer.customerStatus === "active";

  async function handleToggle() {
    const nextStatus = isActive ? "inactive" : "active";
    await updateCustomer(customer._id, { customerStatus: nextStatus });
    message.success(nextStatus === "inactive" ? "Customer deactivated" : "Customer activated");
    onChanged();
  }

  if (isActive) {
    return (
      <Popconfirm
        title="Deactivate this customer?"
        description="This completes every active project for this customer."
        okText="Deactivate"
        okType="danger"
        onConfirm={handleToggle}
      >
        <Button danger size={size} icon={<StopOutlined />} onClick={(event) => event.stopPropagation()}>
          Deactivate
        </Button>
      </Popconfirm>
    );
  }

  return (
    <Button
      size={size}
      icon={<CheckCircleOutlined />}
      onClick={(event) => {
        event.stopPropagation();
        handleToggle();
      }}
    >
      Activate
    </Button>
  );
}

export default CustomerStatusToggleButton;
