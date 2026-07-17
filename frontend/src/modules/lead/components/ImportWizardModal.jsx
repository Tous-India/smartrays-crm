import { useState } from "react";
import { Modal, Steps, Upload, Button, Table, Alert, Typography } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { importLeads } from "../api/leadApi";
import { IMPORT_COLUMN_ALIASES } from "../constants/lead.constants";

const { Dragger } = Upload;
const { Paragraph, Text } = Typography;

/**
 * Upload → column mapping → preview → bulk create, per leads-customer-
 * functional-spec.md's Lead Import section.
 *
 * IMPORTANT, honestly reflecting what the backend actually does
 * (`lead.service.js#importLeadsFromFile`): there is no interactive column-
 * remapping API — columns are matched case-insensitively against a FIXED
 * alias list server-side. So the "mapping" step here is a read-only preview
 * of that exact matching (kept in sync via `IMPORT_COLUMN_ALIASES`), not an
 * editable remap — showing an editable mapping UI backed by an API that
 * can't act on it would be misleading. Row-level preview parsing is done
 * client-side for CSV only (a small hand-rolled split, not a full RFC-4180
 * parser — good enough for a preview, the server does the real, robust
 * parsing via `exceljs`); Excel files skip the row preview since parsing
 * .xlsx client-side would need a second heavy dependency just for a
 * preview.
 */
function ImportWizardModal({ open, onCancel, onImported }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [file, setFile] = useState(null);
  const [previewHeaders, setPreviewHeaders] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  function reset() {
    setCurrentStep(0);
    setFile(null);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setImportResult(null);
  }

  function handleCancel() {
    reset();
    onCancel();
  }

  function handleFileSelected(selectedFile) {
    setFile(selectedFile);

    const isCsv = selectedFile.name.toLowerCase().endsWith(".csv");

    if (isCsv) {
      const reader = new FileReader();
      reader.onload = () => {
        const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
        const headers = (lines[0] || "").split(",").map((header) => header.trim());
        const rows = lines.slice(1, 6).map((line) => line.split(","));
        setPreviewHeaders(headers);
        setPreviewRows(rows);
      };
      reader.readAsText(selectedFile);
    } else {
      setPreviewHeaders([]);
      setPreviewRows([]);
    }

    return false; // prevent antd's default auto-upload
  }

  function matchedFieldForHeader(header) {
    const normalized = header.trim().toLowerCase();
    const match = Object.entries(IMPORT_COLUMN_ALIASES).find(([, aliases]) =>
      aliases.includes(normalized)
    );
    return match ? match[0] : "(not imported)";
  }

  async function handleSubmitImport() {
    setIsSubmitting(true);

    try {
      const response = await importLeads(file);
      setImportResult(response.data.data);
      setCurrentStep(2);
      onImported();
    } finally {
      setIsSubmitting(false);
    }
  }

  const mappingColumns = [
    { title: "Detected Column", dataIndex: "header" },
    { title: "Maps to Lead Field", dataIndex: "field" },
  ];
  const mappingData = previewHeaders.map((header, index) => ({
    key: index,
    header,
    field: matchedFieldForHeader(header),
  }));

  const previewColumns = previewHeaders.map((header, index) => ({
    title: header,
    dataIndex: index,
    key: index,
  }));
  const previewData = previewRows.map((row, rowIndex) => {
    const record = { key: rowIndex };
    row.forEach((cell, cellIndex) => {
      record[cellIndex] = cell;
    });
    return record;
  });

  const skippedColumns = [
    { title: "Row", dataIndex: "row" },
    { title: "Reason", dataIndex: "reason" },
  ];

  return (
    <Modal
      title="Import Leads"
      open={open}
      onCancel={handleCancel}
      width={700}
      destroyOnHidden
      footer={
        currentStep === 0
          ? [
              <Button key="cancel" onClick={handleCancel}>
                Cancel
              </Button>,
              <Button key="next" type="primary" disabled={!file} onClick={() => setCurrentStep(1)}>
                Next
              </Button>,
            ]
          : currentStep === 1
            ? [
                <Button key="back" onClick={() => setCurrentStep(0)}>
                  Back
                </Button>,
                <Button key="submit" type="primary" loading={isSubmitting} onClick={handleSubmitImport}>
                  Import
                </Button>,
              ]
            : [
                <Button key="done" type="primary" onClick={handleCancel}>
                  Done
                </Button>,
              ]
      }
    >
      <Steps
        current={currentStep}
        className="!mb-6"
        items={[{ title: "Upload File" }, { title: "Preview & Mapping" }, { title: "Result" }]}
      />

      {currentStep === 0 && (
        <Dragger accept=".csv,.xlsx,.xls" maxCount={1} beforeUpload={handleFileSelected}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Click or drag a CSV or Excel file to upload</p>
        </Dragger>
      )}

      {currentStep === 1 && (
        <div>
          <Paragraph>
            <Text strong>{file?.name}</Text> — columns are matched automatically
            (case-insensitively); there is no manual remapping step.
          </Paragraph>

          {previewHeaders.length > 0 ? (
            <>
              <Table
                size="small"
                columns={mappingColumns}
                dataSource={mappingData}
                pagination={false}
                className="!mb-4"
              />
              <Table
                size="small"
                columns={previewColumns}
                dataSource={previewData}
                pagination={false}
                scroll={{ x: true }}
              />
            </>
          ) : (
            <Alert
              type="info"
              showIcon
              message="No row preview available for Excel files in this version — the server still parses and imports it normally."
            />
          )}
        </div>
      )}

      {currentStep === 2 && importResult && (
        <div>
          <Alert
            type={importResult.skippedCount > 0 ? "warning" : "success"}
            showIcon
            className="!mb-4"
            message={`Imported ${importResult.importedCount} lead(s), skipped ${importResult.skippedCount}`}
          />

          {importResult.skipped.length > 0 && (
            <Table
              size="small"
              columns={skippedColumns}
              dataSource={importResult.skipped.map((entry, index) => ({ key: index, ...entry }))}
              pagination={false}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

export default ImportWizardModal;
