import { useState } from "react";
import { App, Button, Modal, Spin } from "antd";
import { CopyOutlined, MessageOutlined, ShareAltOutlined, WhatsAppOutlined } from "@ant-design/icons";
import { getCustomerComplaintLink } from "../api/complaintApi";
import { complaintFormUrl, complaintShareText, smsHref, whatsAppHref } from "../utils/complaintShare";

/**
 * "Share complaint link" (2026-10-23) — WhatsApp, SMS or Copy, with a short
 * ready message.
 *
 * - Without `customerId`: the ONE public complaint form, for anyone.
 * - With `customerId` (a customer's page): THAT customer's own link with a
 *   code — the form opens prefilled and needs no phone check — and WhatsApp /
 *   SMS open addressed to the customer's `phone`.
 */
function ShareComplaintLinkButton({ customerId, phone, customerName, size }) {
  const { message } = App.useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState(customerId ? null : complaintFormUrl());
  const text = url ? complaintShareText(url) : "";

  async function open() {
    setIsOpen(true);
    if (!customerId || url) return;
    try {
      const response = await getCustomerComplaintLink(customerId);
      setUrl(response.data.data.url);
    } catch (error) {
      setIsOpen(false);
      message.error(error.response?.data?.message || "Could not get the complaint link");
    }
  }

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
      <Button icon={<ShareAltOutlined />} size={size} onClick={open}>
        Share complaint link
      </Button>

      {isOpen && (
        <Modal open onCancel={() => setIsOpen(false)} footer={null} title="Share complaint link" width={460}>
          <p className="mb-2 text-gray-600">
            {customerName
              ? `${customerName}'s own link: the form opens with their details filled in.`
              : "Customers tell us about a problem — or a new requirement — without logging in."}
          </p>
          {url ? (
            <>
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
            </>
          ) : (
            <div className="py-6 text-center">
              <Spin />
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

export default ShareComplaintLinkButton;
