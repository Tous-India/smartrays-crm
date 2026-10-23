import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { App, Alert, Button, Image, Input, Modal, Spin, Tag, Timeline } from "antd";
import { ArrowLeftOutlined, CameraOutlined, EnvironmentOutlined, PhoneOutlined, RollbackOutlined } from "@ant-design/icons";
import useSessionStore from "../../../store/sessionStore";
import {
  addComplaintPhoto,
  assignComplaint,
  changeComplaintStatus,
  getComplaint,
  sendComplaintBack,
} from "../api/complaintApi";
import { CALLBACK_LABEL, PRIORITY, STAFF_STATUS, WORK_STEPS } from "../constants/complaint.constants";
import { shrinkPhoto } from "../utils/shrinkPhoto";
import { formatDate, formatDateTime } from "../../../utils/date.utils";
import AssignComplaintModal from "./AssignComplaintModal";

/**
 * `/complaints/:id` (2026-10-23) — one complaint, as a full page (it reads
 * on a phone). Everything the customer sent, the matched customer, photos,
 * who it is assigned to and by whom, and the history of every change.
 *
 * - Assigners: Assign / Reassign (technician, priority, visit date).
 * - The technician: one tap to call, Google Maps, the next steps (On the
 *   way → Working → Resolved, with an optional note), live photos, and
 *   "Send back" with a reason.
 * The server decides who may do what; the buttons only show what it would accept.
 */

const STEP_INDEX = { assigned: 0, on_the_way: 1, working: 2, resolved: 3 };

function mapsHref(complaint) {
  if (complaint.location) return `https://www.google.com/maps?q=${complaint.location.lat},${complaint.location.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(complaint.address || "")}`;
}

function historyText(entry) {
  if (entry.type === "comment" && entry.by === "Customer") return "Complaint received";
  if (entry.type === "status_change") return `${STAFF_STATUS[entry.toStatus]?.label || entry.toStatus}${entry.comment ? ` — ${entry.comment}` : ""}`;
  if (entry.type === "sent_back") return `Sent back — ${entry.comment}`;
  return entry.comment || entry.type;
}

function Section({ title, children }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      {title && <h2 className="mb-2 text-base font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

function ComplaintDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const me = useSessionStore((state) => state.user);
  const [complaint, setComplaint] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [note, setNote] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [isSendingBack, setIsSendingBack] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonProblem, setReasonProblem] = useState("");
  const photoInput = useRef(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await getComplaint(id);
      setComplaint(response.data.data);
    } catch (error) {
      setLoadError(error.response?.status === 404 ? "This complaint was not found, or it is no longer assigned to you." : "Could not load the complaint.");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action, successText) {
    setIsBusy(true);
    try {
      const response = await action();
      if (response?.data?.data?._id && response.data.data.history) setComplaint(response.data.data);
      else await load();
      message.success(successText);
      return true;
    } catch (error) {
      message.error(error.response?.data?.message || "Could not save. Please try again.");
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  async function moveTo(step) {
    const ok = await run(() => changeComplaintStatus(id, step, note.trim() || undefined), `Marked ${STAFF_STATUS[step].label}`);
    if (ok) setNote("");
  }

  async function addPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await run(async () => addComplaintPhoto(id, await shrinkPhoto(file)), "Photo added");
  }

  async function sendBack() {
    if (reason.trim().length < 5) {
      setReasonProblem("Please say why you are sending it back.");
      return;
    }
    setIsBusy(true);
    try {
      await sendComplaintBack(id, reason.trim());
      message.success("Sent back");
      navigate("/complaints");
    } catch (error) {
      message.error(error.response?.data?.message || "Could not send it back.");
    } finally {
      setIsBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <Link to="/complaints" className="text-brand-navy">
          <ArrowLeftOutlined /> Complaints
        </Link>
        <Alert type="error" showIcon message={loadError} action={<Button onClick={load}>Try again</Button>} />
      </div>
    );
  }
  if (!complaint) {
    return (
      <div className="py-16 text-center">
        <Spin />
      </div>
    );
  }

  const isMine = complaint.assignedTo?._id === me?._id;
  const resolved = ["resolved", "closed"].includes(complaint.status);
  const current = STEP_INDEX[complaint.status];
  const nextSteps = complaint.canWork && current !== undefined && !resolved ? WORK_STEPS.filter((step) => STEP_INDEX[step.value] > current) : [];
  const priority = PRIORITY[complaint.priority];
  const assignerFirstName = complaint.assignedBy?.name?.split(" ")[0];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/complaints" className="text-brand-navy">
        <ArrowLeftOutlined /> Complaints
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Complaint {complaint.number}</h1>
        <div className="flex gap-1">
          <Tag color={STAFF_STATUS[complaint.status]?.color}>{STAFF_STATUS[complaint.status]?.label}</Tag>
          {priority && <Tag color={priority.color}>{priority.label}</Tag>}
        </div>
      </div>

      <Section title={complaint.contactName || "Customer"}>
        {complaint.matchedCustomer ? (
          <p className="mb-2 rounded-lg bg-green-50 px-3 py-2 text-green-900">
            Existing customer: {complaint.matchedCustomer.companyName}
            {complaint.matchedCustomer.commissioningDate ? `, installed ${formatDate(complaint.matchedCustomer.commissioningDate)}` : ""}
            {complaint.canAssign && (
              <>
                {" · "}
                <Link to={`/customers/${complaint.matchedCustomer._id}`}>Open customer</Link>
              </>
            )}
          </p>
        ) : (
          <p className="mb-2 rounded-lg bg-gray-50 px-3 py-2 text-gray-700">Not matched to an existing customer — details as typed.</p>
        )}
        <p className="text-gray-700">{complaint.address}</p>
        {complaint.callbackTime && <p className="text-sm text-gray-500">Call: {CALLBACK_LABEL[complaint.callbackTime]}</p>}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {complaint.contactPhone && (
            <Button
              type="primary"
              size="large"
              icon={<PhoneOutlined />}
              href={`tel:${complaint.contactPhone.replace(/[^\d+]/g, "")}`}
              className="sm:flex-1"
            >
              Call {complaint.contactPhone}
            </Button>
          )}
          <Button size="large" icon={<EnvironmentOutlined />} href={mapsHref(complaint)} target="_blank" rel="noopener noreferrer" className="sm:flex-1">
            Open in Google Maps
          </Button>
        </div>
      </Section>

      <Section title="What the customer said">
        <p className="whitespace-pre-wrap">{complaint.description}</p>
        <p className="mt-1 text-sm text-gray-500">Sent {formatDateTime(complaint.createdAt)}</p>
        {complaint.customerPhotos.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Image.PreviewGroup>
              {complaint.customerPhotos.map((photo, index) => (
                <Image key={photo.url} src={photo.url} alt={`Customer photo ${index + 1}`} width={96} height={96} className="rounded-lg object-cover" />
              ))}
            </Image.PreviewGroup>
          </div>
        )}
      </Section>

      <Section title="Assignment">
        {complaint.assignedTo ? (
          <div className="space-y-1">
            <p>
              <span className="font-semibold">{complaint.assignedTo.name}</span>
              {complaint.visitDate && ` · visit ${formatDate(complaint.visitDate)}`}
            </p>
            {complaint.assignedBy && <p className="text-sm text-gray-500">Assigned by {complaint.assignedBy.name}</p>}
          </div>
        ) : (
          <p className="font-semibold text-red-700">Not assigned yet</p>
        )}
        {complaint.canAssign && (
          <Button type="primary" size="large" className="mt-3" onClick={() => setIsAssigning(true)}>
            {complaint.assignedTo ? "Reassign" : "Assign"}
          </Button>
        )}
      </Section>

      {complaint.canWork && complaint.assignedTo && !resolved && (
        <Section title="Update">
          <label htmlFor="complaint-note" className="mb-1 block text-sm text-gray-700">
            Note (optional)
          </label>
          <Input.TextArea id="complaint-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} placeholder="What did you find or do?" />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {nextSteps.map((step) => (
              <Button key={step.value} size="large" type={step.value === "resolved" ? "primary" : "default"} loading={isBusy} onClick={() => moveTo(step.value)}>
                {step.label}
              </Button>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input ref={photoInput} type="file" accept="image/*" capture="environment" onChange={addPhoto} className="hidden" data-testid="complaint-photo-input" />
            <Button size="large" icon={<CameraOutlined />} onClick={() => photoInput.current?.click()} disabled={isBusy} className="sm:flex-1">
              Add photo
            </Button>
            {isMine && (
              <Button size="large" danger icon={<RollbackOutlined />} onClick={() => setIsSendingBack(true)} disabled={isBusy} className="sm:flex-1">
                Send back{assignerFirstName ? ` to ${assignerFirstName}` : ""}
              </Button>
            )}
          </div>
        </Section>
      )}

      {complaint.staffPhotos.length > 0 && (
        <Section title="Photos from the site">
          <div className="flex flex-wrap gap-2">
            <Image.PreviewGroup>
              {complaint.staffPhotos.map((photo, index) => (
                <Image key={photo.url} src={photo.url} alt={`Site photo ${index + 1} by ${photo.by}`} width={96} height={96} className="rounded-lg object-cover" />
              ))}
            </Image.PreviewGroup>
          </div>
        </Section>
      )}

      <Section title="History">
        <Timeline
          items={complaint.history.map((entry, index) => ({
            key: index,
            children: (
              <div>
                <p>{historyText(entry)}</p>
                <p className="text-sm text-gray-500">
                  {entry.by} · {formatDateTime(entry.createdAt)}
                </p>
              </div>
            ),
          }))}
        />
      </Section>

      {isAssigning && (
        <AssignComplaintModal
          complaint={complaint}
          onCancel={() => setIsAssigning(false)}
          onAssign={async (body) => {
            const ok = await run(() => assignComplaint(id, body), "Assigned");
            if (ok) setIsAssigning(false);
          }}
        />
      )}

      {isSendingBack && (
        <Modal
          open
          title="Send back"
          okText="Send back"
          okButtonProps={{ danger: true, loading: isBusy }}
          onOk={sendBack}
          onCancel={() => setIsSendingBack(false)}
        >
          <p className="mb-2 text-gray-600">It goes back to the complaints list, unassigned. Say why:</p>
          <Input.TextArea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setReasonProblem("");
            }}
            maxLength={500}
            rows={3}
          />
          {reasonProblem && (
            <p role="alert" className="mt-2 text-red-700">
              {reasonProblem}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

export default ComplaintDetailPage;
