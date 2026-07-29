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
 * **Two display modes, one shared implementation:** `iconOnly` (default
 * `true`, preserving the List table's existing compact behavior) renders
 * `StopOutlined`/`CheckCircleOutlined` alone inside a `type="text"` button —
 * matching this codebase's one other icon-only table-row-action precedent
 * (`LeadsTable.jsx`'s Log Call/Hot-toggle buttons) — wrapped in a `Tooltip`
 * so the action stays discoverable, with `aria-label` keeping the button's
 * accessible name identical to the visible-text version (also why existing
 * `getByRole("button", { name: /Deactivate/ })`-style queries still match
 * unchanged). `iconOnly={false}` (the Customer Detail header's own mode)
 * renders the same icon plus its visible text label instead — no `Tooltip`
 * needed once the label itself is on-screen. Both modes share the exact
 * same `handleToggle`/`Popconfirm` — there is still only one place calling
 * `PATCH /customers/:id` and one place owning the confirmation copy.
 */
function CustomerStatusToggleButton({ customer, onChanged, size, iconOnly = true }) {
  const isActive = customer.customerStatus === "active";

  async function handleToggle() {
    const nextStatus = isActive ? "inactive" : "active";
    await updateCustomer(customer._id, { customerStatus: nextStatus });
    message.success(nextStatus === "inactive" ? "Customer deactivated" : "Customer activated");
    onChanged();
  }

  if (isActive) {
    const deactivateButton = (
      <Button
        danger
        type={iconOnly ? "text" : "default"}
        size={size}
        icon={<StopOutlined />}
        aria-label="Deactivate"
        onClick={(event) => event.stopPropagation()}
      >
        {!iconOnly && "Deactivate"}
      </Button>
    );

    return (
      <Popconfirm
        title="Deactivate this customer?"
        description="This completes every active project for this customer."
        okText="Deactivate"
        okType="danger"
        onConfirm={handleToggle}
      >
        {iconOnly ? <Tooltip title="Deactivate">{deactivateButton}</Tooltip> : deactivateButton}
      </Popconfirm>
    );
  }

  const activateButton = (
    <Button
      type={iconOnly ? "text" : "default"}
      size={size}
      icon={<CheckCircleOutlined />}
      aria-label="Activate"
      onClick={(event) => {
        event.stopPropagation();
        handleToggle();
      }}
    >
      {!iconOnly && "Activate"}
    </Button>
  );

  return iconOnly ? <Tooltip title="Activate">{activateButton}</Tooltip> : activateButton;
}

export default CustomerStatusToggleButton;
