import { useState } from "react";
import { Button, Select, Space, App } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { generateReport, triggerBlobDownload } from "../services/reportApi";

const FORMAT_OPTIONS = [
  { value: "xlsx", label: "Excel (.xlsx)" },
  { value: "pdf", label: "PDF" },
];

/**
 * A `format` picker + Download button wired straight to the unified
 * `POST /reports/generate` dispatcher (§7.11) — shared by every module that
 * offers a report (Leads, Customers, Attendance, Leave, Payroll, Transport),
 * so the "pick a format, hit download, stream the file, trigger a real
 * download" flow is written once, not once per module. The dispatcher
 * streams the file directly (2026-08-04 — no more Cloudinary upload step),
 * so this button turns the blob response straight into a download rather
 * than redirecting to a hosted URL.
 *
 * `filters` is passed straight through to the dispatcher as-is — each
 * caller shapes it however that module's own report filters need to look
 * (e.g. Attendance/Transport's `{from, to}`, Leave's `{scope}`).
 */
function ReportDownloadButton({ module, filters, filenamePrefix }) {
  const { message } = App.useApp();
  const [format, setFormat] = useState("xlsx");
  const [isDownloading, setIsDownloading] = useState(false);

  async function handleDownload() {
    setIsDownloading(true);

    try {
      const response = await generateReport({ module, filters, format });
      triggerBlobDownload(response.data, `${filenamePrefix || module}-report.${format}`);
    } catch {
      message.error("Could not generate the report — please try again.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Space>
      <Select value={format} options={FORMAT_OPTIONS} style={{ width: 150 }} onChange={setFormat} />
      <Button icon={<DownloadOutlined />} loading={isDownloading} onClick={handleDownload}>
        Download Report
      </Button>
    </Space>
  );
}

export default ReportDownloadButton;
