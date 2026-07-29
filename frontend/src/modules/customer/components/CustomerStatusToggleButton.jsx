import { Button, Popconfirm, Tooltip, message } from "antd";
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
 *
 * Icon-only, not icon+text — `StopOutlined`/`CheckCircleOutlined` are the
 * exact icons this component already used before, just without the label
 * now sitting next to them. A `Tooltip` carries the same text on hover so
 * the action stays discoverable, and `aria-label` keeps the button's
 * accessible name identical to the old visible text (also why existing
 * `getByRole("button", { name: /Deactivate/ })`-style queries still match
 * unchanged). `type="text"` matches this codebase's one other icon-only
 * table-row-action precedent (`LeadsTable.jsx`'s Log Call/Hot-toggle
 * buttons) rather than inventing a new bordered-icon-button style.
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
        <Tooltip title="Deactivate">
          <Button
            danger
            type="text"
            size={size}
            icon={<StopOutlined />}
            aria-label="Deactivate"
            onClick={(event) => event.stopPropagation()}
          />
        </Tooltip>
      </Popconfirm>
    );
  }

  return (
    <Tooltip title="Activate">
      <Button
        type="text"
        size={size}
        icon={<CheckCircleOutlined />}
        aria-label="Activate"
        onClick={(event) => {
          event.stopPropagation();
          handleToggle();
        }}
      />
    </Tooltip>
  );
}

export default CustomerStatusToggleButton;
