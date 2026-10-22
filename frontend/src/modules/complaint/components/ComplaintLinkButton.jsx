import { useState } from "react";
import { App, Button, Modal, Popconfirm, Tooltip } from "antd";
import { LinkOutlined, WhatsAppOutlined, CopyOutlined } from "@ant-design/icons";
import { getComplaintLink, resetComplaintLink } from "../api/complaintApi";
import { complaintWhatsAppText } from "../utils/complaintShare";

/**
 * "Complaint link" (2026-10-22) — one click copies this customer's complaint
 * link and opens a small panel to share it on WhatsApp. The WhatsApp button
 * is a plain wa.me link with a ready message: free, no setup, opens WhatsApp
 * on the phone or WhatsApp Web on a computer.
 *
 * `compact` renders an icon-only button for table rows.
 */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function ComplaintLinkButton({ customerId, customerName, compact = false }) {
  const { message } = App.useApp();
  const [link, setLink] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  async function openLink() {
    setIsBusy(true);
    try {
      const response = await getComplaintLink(customerId);
      const { url } = response.data.data;
      setLink(url);
      setIsOpen(true);
      if (await copyText(url)) message.success("Complaint link copied");
    } catch (error) {
      message.error(error.response?.data?.message || "Could not get the complaint link");
    } finally {
      setIsBusy(false);
    }
  }

  async function makeNewLink() {
    setIsBusy(true);
    try {
      const response = await resetComplaintLink(customerId);
      setLink(response.data.data.url);
      message.success("New link made — the old link no longer works");
    } catch (error) {
      message.error(error.response?.data?.message || "Could not make a new link");
    } finally {
      setIsBusy(false);
    }
  }

  const whatsAppHref = link ? `https://wa.me/?text=${encodeURIComponent(complaintWhatsAppText(customerName, link))}` : "#";

  return (
    <>
      {compact ? (
        <Tooltip title="Copy complaint link">
          <Button size="small" icon={<LinkOutlined />} loading={isBusy} onClick={openLink} aria-label={`Complaint link for ${customerName}`} />
        </Tooltip>
      ) : (
        <Button icon={<LinkOutlined />} loading={isBusy} onClick={openLink}>
          Complaint link
        </Button>
      )}

      {/* Created only once opened — this button sits on every customers-table row. */}
      {isOpen && (
      <Modal
        open={isOpen}
        onCancel={() => setIsOpen(false)}
        footer={null}
        title={`Complaint link — ${customerName}`}
        width={460}
      >
        <p className="mb-2 text-gray-600">
          Send this to the customer. They can raise a complaint without logging in, and check its status later on the
          same link.
        </p>
        <div className="mb-4 break-all rounded-lg bg-gray-50 px-3 py-2 font-mono text-sm" data-testid="complaint-link-url">
          {link}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="primary"
            size="large"
            icon={<WhatsAppOutlined />}
            href={whatsAppHref}
            target="_blank"
            rel="noopener noreferrer"
            className="sm:flex-1"
            style={{ background: "#1d8343" }}
          >
            Share on WhatsApp
          </Button>
          <Button
            size="large"
            icon={<CopyOutlined />}
            className="sm:flex-1"
            onClick={async () => {
              if (await copyText(link)) message.success("Copied");
              else message.error("Could not copy — select the link and copy it");
            }}
          >
            Copy again
          </Button>
        </div>
        <div className="mt-4 border-t pt-3 text-right">
          <Popconfirm
            title="Make a new link?"
            description="The old link will stop working. Use this only if the link went to the wrong person."
            okText="Make new link"
            onConfirm={makeNewLink}
          >
            <Button type="link" danger size="small" disabled={isBusy}>
              Make a new link
            </Button>
          </Popconfirm>
        </div>
      </Modal>
      )}
    </>
  );
}

export default ComplaintLinkButton;
