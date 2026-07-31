import { Tooltip, Button, App } from "antd";
import { CopyOutlined } from "@ant-design/icons";

/**
 * Phone number + copy-to-clipboard button, extracted from `LeadsTable.jsx`'s
 * original Contact column so the Customers table's own Contact column (and
 * any future one) reuses the exact same behavior rather than a second,
 * slightly-different copy of it.
 *
 * `writeText` rejects (e.g. `NotAllowedError` when the document isn't
 * focused) — handled explicitly rather than left as an uncaught rejection,
 * same reasoning as `LeadFormModal`'s `validateFields` fix.
 */
function CopyablePhoneCell({ phone }) {
  const { message } = App.useApp();

  if (!phone) {
    return null;
  }

  function handleCopy(event) {
    event.stopPropagation();
    navigator.clipboard
      .writeText(phone)
      .then(() => message.success("Phone number copied"))
      .catch(() => message.error("Couldn't copy — please copy it manually"));
  }

  return (
    <span className="flex items-center gap-1 text-xs text-gray-500">
      {phone}
      <Tooltip title="Copy phone number">
        <Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopy} />
      </Tooltip>
    </span>
  );
}

export default CopyablePhoneCell;
