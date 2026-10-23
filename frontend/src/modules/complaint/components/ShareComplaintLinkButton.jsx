import { useState } from "react";
import { App, Button, Modal } from "antd";
import { CopyOutlined, MessageOutlined, ShareAltOutlined, WhatsAppOutlined } from "@ant-design/icons";
import { complaintFormUrl, complaintShareText, smsHref, whatsAppHref } from "../utils/complaintShare";

/**
 * "Share complaint link" (2026-10-23) — the ONE public complaint form, for
 * every customer. WhatsApp, SMS or Copy, with a short ready message. From a
 * customer's page (`phone`, `customerName`), WhatsApp and SMS open addressed
 * to that customer.
 */
function ShareComplaintLinkButton({ phone, customerName, size }) {
  const { message } = App.useApp();
  const [isOpen, setIsOpen] = useState(false);
  const url = complaintFormUrl();
  const text = complaintShareText(url);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      message.success("Copied — paste it in any chat");
    } catch {
      message.error("Could not copy — select the link and copy it");
    }
  }

  return (
    <>
      <Button icon={<ShareAltOutlined />} size={size} onClick={() => setIsOpen(true)}>
        Share complaint link
      </Button>

      {isOpen && (
        <Modal open onCancel={() => setIsOpen(false)} footer={null} title="Share complaint link" width={460}>
          <p className="mb-2 text-gray-600">
            {customerName ? `Send this to ${customerName}. ` : ""}
            Customers tell us about a problem — or a new requirement — without logging in.
          </p>
          <div className="mb-4 break-all rounded-lg bg-gray-50 px-3 py-2 text-sm" data-testid="complaint-link-url">
            {text}
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="primary"
              size="large"
              icon={<WhatsAppOutlined />}
              href={whatsAppHref(text, phone)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: "#1d8343" }}
            >
              WhatsApp
            </Button>
            <Button size="large" icon={<MessageOutlined />} href={smsHref(text, phone)}>
              SMS
            </Button>
            <Button size="large" icon={<CopyOutlined />} onClick={copy}>
              Copy
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

export default ShareComplaintLinkButton;
