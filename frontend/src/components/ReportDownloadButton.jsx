import { useState } from "react";
import { Button, Select, Space, message } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { generateReport, triggerFileDownload } from "../services/reportApi";

const FORMAT_OPTIONS = [
  { value: "xlsx", label: "Excel (.xlsx)" },
  { value: "pdf", label: "PDF" },
];

/**
 * A `format` picker + Download button wired straight to the unified
 * `POST /reports/generate` dispatcher (§7.11) — shared by every module that
 * offers a report (Attendance, Leave, and later Payroll/Transport/Leads/
 * Customers), so the "pick a format, hit download, get a { downloadUrl }
 * and trigger a real download" flow is written once, not once per module.
 *
 * `filters` is passed straight through to the dispatcher as-is — each
 * caller shapes it however that module's own report filters need to look
 * (e.g. Attendance/Transport's `{from, to}`, Leave's `{scope}`).
 */
function ReportDownloadButton({ module, filters, filenamePrefix }) {
  const [format, setFormat] = useState("xlsx");
  const [isDownloading, setIsDownloading] = useState(false);

  async function handleDownload() {
    setIsDownloading(true);

    try {
      const response = await generateReport({ module, filters, format });
      const { downloadUrl } = response.data.data;
      triggerFileDownload(downloadUrl, `${filenamePrefix || module}-report.${format}`);
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
