import { useEffect, useState } from "react";
import { DatePicker, Modal, Segmented, Select } from "antd";
import dayjs from "dayjs";
import { listComplaintAssignees } from "../api/complaintApi";
import { PRIORITIES } from "../constants/complaint.constants";
import { DISPLAY_DATE_FORMAT } from "../../../utils/date.utils";

/**
 * Assign / reassign a complaint (2026-10-23) — who goes (any active staff
 * member), how urgent, and on which day. All three are required.
 */
function AssignComplaintModal({ complaint, onCancel, onAssign }) {
  const [people, setPeople] = useState([]);
  const [assignedToId, setAssignedToId] = useState(complaint.assignedTo?._id ?? null);
  const [priority, setPriority] = useState(complaint.priority ?? "medium");
  const [visitDate, setVisitDate] = useState(complaint.visitDate ? dayjs(complaint.visitDate) : null);
  const [isSaving, setIsSaving] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    listComplaintAssignees()
      .then((response) => setPeople(response.data.data))
      .catch(() => setPeople([]));
  }, []);

  async function save() {
    if (!assignedToId) return setProblem("Choose who should go.");
    if (!visitDate) return setProblem("Choose a visit date.");
    setProblem("");
    setIsSaving(true);
    try {
      await onAssign({ assignedToId, priority, visitDate: visitDate.format("YYYY-MM-DD") });
    } finally {
      setIsSaving(false);
    }
    return undefined;
  }

  return (
    <Modal
      open
      title={complaint.assignedTo ? `Reassign complaint ${complaint.number}` : `Assign complaint ${complaint.number}`}
      okText="Assign"
      onOk={save}
      confirmLoading={isSaving}
      onCancel={onCancel}
      destroyOnHidden
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1 font-medium">Who should go?</p>
          <Select
            showSearch
            className="w-full"
            size="large"
            placeholder="Choose a person"
            value={assignedToId}
            onChange={setAssignedToId}
            optionFilterProp="label"
            options={people.map((person) => ({ value: person._id, label: person.name }))}
          />
        </div>
        <div>
          <p className="mb-1 font-medium">Priority</p>
          <Segmented block size="large" value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} />
        </div>
        <div>
          <p className="mb-1 font-medium">Visit date</p>
          <DatePicker
            className="w-full"
            size="large"
            placeholder="Visit date"
            format={DISPLAY_DATE_FORMAT}
            value={visitDate}
            onChange={setVisitDate}
            disabledDate={(day) => day.isBefore(dayjs().startOf("day"))}
            inputReadOnly={false}
          />
        </div>
        {problem && (
          <p role="alert" className="text-red-700">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}

export default AssignComplaintModal;
