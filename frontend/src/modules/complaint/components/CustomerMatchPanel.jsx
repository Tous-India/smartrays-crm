import { useState } from "react";
import { Link } from "react-router-dom";
import { App, Button, Select } from "antd";
import { linkComplaintCustomer, saveComplaintContact, searchComplaintCustomers } from "../api/complaintApi";
import { formatDate } from "../../../utils/date.utils";

/**
 * Who the caller is (2026-10-23), on the complaint page.
 *
 * - Matched: "Existing customer: …, installed …".
 * - Not matched: the company / household name they typed; for assigners,
 *   "Did you mean …?" with one-tap Link, or a search to find the customer.
 * - Once linked, if the caller's number is new for that customer: "Save … as
 *   a contact for …?".
 * `onChange` receives the updated complaint the server returns.
 */
function CustomerMatchPanel({ complaint, onChange }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState([]);
  const [picked, setPicked] = useState(null);
  const customer = complaint.matchedCustomer;

  async function run(action, successText) {
    setBusy(true);
    try {
      const response = await action();
      onChange(response.data.data);
      message.success(successText);
    } catch (error) {
      message.error(error.response?.data?.message || "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function search(text) {
    if (text.trim().length < 2) return setOptions([]);
    try {
      const response = await searchComplaintCustomers(text.trim());
      setOptions(response.data.data.map((c) => ({ value: c._id, label: c.companyName })));
    } catch {
      setOptions([]);
    }
    return undefined;
  }

  const link = (customerId) => run(() => linkComplaintCustomer(complaint._id, customerId), "Linked to the customer");

  if (customer) {
    return (
      <div className="mb-2 space-y-2">
        <p className="rounded-lg bg-green-50 px-3 py-2 text-green-900">
          Existing customer: {customer.companyName}
          {customer.commissioningDate ? `, installed ${formatDate(customer.commissioningDate)}` : ""}
          {complaint.canAssign && (
            <>
              {" · "}
              <Link to={`/customers/${customer._id}`}>Open customer</Link>
            </>
          )}
        </p>
        {complaint.canSaveContact && (
          <Button loading={busy} onClick={() => run(() => saveComplaintContact(complaint._id), "Saved as a contact")}>
            Save {complaint.contactPhone} as a contact for {customer.companyName}?
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="mb-2 space-y-2 rounded-lg bg-amber-50 px-3 py-2">
      <p className="text-gray-800">Not matched to an existing customer.</p>
      {complaint.companyName && <p className="font-semibold">They typed: {complaint.companyName}</p>}
      {complaint.canAssign && (
        <>
          {(complaint.suggestedCustomers || []).map((suggestion) => (
            <div key={suggestion._id} className="flex flex-wrap items-center gap-2">
              <span>Did you mean {suggestion.companyName}?</span>
              <Button size="small" type="primary" loading={busy} onClick={() => link(suggestion._id)}>
                Link to {suggestion.companyName}
              </Button>
            </div>
          ))}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              showSearch
              filterOption={false}
              onSearch={search}
              options={options}
              value={picked}
              onChange={setPicked}
              placeholder="Find the customer…"
              className="sm:flex-1"
              notFoundContent={null}
            />
            <Button disabled={!picked} loading={busy} onClick={() => link(picked)}>
              Link
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default CustomerMatchPanel;
