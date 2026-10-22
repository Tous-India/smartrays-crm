import { useEffect, useMemo, useState } from "react";
import { App, Button, Checkbox, DatePicker, Input, Modal, Select, Tag } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { createVisit, findAddress, listVisitAssignees, listVisitCustomers } from "../api/visitApi";
import { VISIT_PURPOSES } from "../constants/visit.constants";
import VisitMap from "./VisitMap";

/**
 * Assign a site visit (2026-10-22) — admin or manager. Five things, in order:
 * customer, what for, who, which day, where exactly (prefilled from the
 * customer's saved site; otherwise "Find" the address or tap the map). The
 * picked spot is saved on the customer for next time.
 */
function AssignVisitModal({ defaultDate, onClose, onAssigned }) {
  const { message } = App.useApp();
  const [customers, setCustomers] = useState([]);
  const [people, setPeople] = useState([]);
  const [customerId, setCustomerId] = useState(null);
  const [purpose, setPurpose] = useState(VISIT_PURPOSES[0]);
  const [assignedToId, setAssignedToId] = useState(null);
  const [date, setDate] = useState(defaultDate || dayjs());
  const [site, setSite] = useState(null);
  const [address, setAddress] = useState("");
  const [saveToCustomer, setSaveToCustomer] = useState(true);
  const [instructions, setInstructions] = useState("");
  const [isFinding, setIsFinding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    listVisitCustomers()
      .then((response) => setCustomers(response.data.data))
      .catch(() => setCustomers([]));
    listVisitAssignees()
      .then((response) => setPeople(response.data.data))
      .catch(() => setPeople([]));
  }, []);

  const customer = useMemo(() => customers.find((c) => c._id === customerId), [customers, customerId]);

  function chooseCustomer(id) {
    setCustomerId(id);
    const chosen = customers.find((c) => c._id === id);
    setAddress(chosen?.siteAddress || "");
    setSite(chosen?.siteLocation?.lat != null ? { lat: chosen.siteLocation.lat, lng: chosen.siteLocation.lng } : null);
  }

  async function find() {
    if (!address.trim()) return;
    setIsFinding(true);
    try {
      const found = await findAddress(address);
      if (found) {
        setSite({ lat: found.lat, lng: found.lng });
        message.success("Found — tap the map to move the pin exactly onto the site");
      } else {
        message.warning("Address not found. Tap the map to place the site.");
      }
    } catch {
      message.warning("Could not search the address. Tap the map to place the site.");
    } finally {
      setIsFinding(false);
    }
  }

  async function save() {
    setIsSaving(true);
    try {
      await createVisit({
        customerId,
        purpose,
        assignedToId,
        dueDate: date.hour(11).minute(0).second(0).toISOString(),
        site,
        siteAddress: address.trim() || undefined,
        saveToCustomer,
        instructions: instructions.trim() || undefined,
      });
      message.success("Visit assigned — they will get a notification");
      onAssigned();
    } catch (error) {
      message.error(error.response?.data?.message || "Could not assign the visit");
    } finally {
      setIsSaving(false);
    }
  }

  const ready = customerId && assignedToId && site && date;

  return (
    <Modal open title="Assign a site visit" onCancel={onClose} width={640} okText="Assign visit" onOk={save} okButtonProps={{ disabled: !ready, loading: isSaving, size: "large" }} cancelButtonProps={{ size: "large" }}>
      <div className="space-y-4">
        <div>
          <div className="mb-1 font-semibold">Customer</div>
          <Select className="w-full" size="large" showSearch optionFilterProp="label" placeholder="Choose the customer" value={customerId} onChange={chooseCustomer} options={customers.map((c) => ({ value: c._id, label: c.companyName }))} />
        </div>

        <div>
          <div className="mb-1 font-semibold">What is the visit for?</div>
          <div className="flex flex-wrap gap-2">
            {VISIT_PURPOSES.map((option) => (
              <Tag.CheckableTag key={option} checked={purpose === option} onChange={() => setPurpose(option)} className="!px-3 !py-1 text-sm">
                {option}
              </Tag.CheckableTag>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 font-semibold">Who goes</div>
            <Select className="w-full" size="large" showSearch optionFilterProp="label" placeholder="Choose a person" value={assignedToId} onChange={setAssignedToId} options={people.map((p) => ({ value: p._id, label: p.name }))} />
          </div>
          <div>
            <div className="mb-1 font-semibold">Day</div>
            <DatePicker className="w-full" size="large" value={date} onChange={(value) => value && setDate(value)} allowClear={false} format="ddd, D MMM YYYY" />
          </div>
        </div>

        <div>
          <div className="mb-1 font-semibold">Where exactly</div>
          <div className="mb-2 flex gap-2">
            <Input size="large" placeholder="Site address" value={address} onChange={(event) => setAddress(event.target.value)} onPressEnter={find} />
            <Button size="large" icon={<SearchOutlined />} loading={isFinding} onClick={find}>Find</Button>
          </div>
          <VisitMap site={site} onPick={setSite} height={260} />
          <div className="mt-1 text-xs text-gray-500">
            {site ? "Tap the map to move the site. Arrived and Done work only within 200 m of it." : "Find the address, or tap the map to place the site."}
          </div>
          {customer && (
            <Checkbox className="mt-2" checked={saveToCustomer} onChange={(event) => setSaveToCustomer(event.target.checked)}>
              Save this spot as {customer.companyName}'s site
            </Checkbox>
          )}
        </div>

        <div>
          <div className="mb-1 font-semibold">Instructions <span className="font-normal text-gray-500">(optional)</span></div>
          <Input.TextArea rows={2} maxLength={500} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="For example: check the inverter error and photograph the meter." />
        </div>
      </div>
    </Modal>
  );
}

export default AssignVisitModal;
