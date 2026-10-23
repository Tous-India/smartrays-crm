import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PublicShell from "./PublicShell";
import { getPublicComplaintStatus } from "../api/complaintApi";
import { PUBLIC_STEPS } from "../constants/complaint.constants";
import { formatDate } from "../../../utils/date.utils";

/**
 * `/complaint/status/:token` — the customer's status page (2026-10-23).
 * PUBLIC: the token from the link they kept is the only key. Five steps —
 * Received, Assigned, On the way, Working, Resolved — and, once assigned,
 * the technician's first name and the visit date. Nothing internal.
 */
function PublicComplaintStatus() {
  const { token } = useParams();
  const [status, setStatus] = useState(null);
  const [loadState, setLoadState] = useState("loading"); // loading | ready | invalid | error

  const load = useCallback(async () => {
    try {
      const response = await getPublicComplaintStatus(token);
      setStatus(response.data.data);
      setLoadState("ready");
    } catch (error) {
      setLoadState(error.response?.status === 404 ? "invalid" : "error");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadState === "loading") {
    return (
      <PublicShell>
        <p className="py-16 text-center text-gray-500">Loading…</p>
      </PublicShell>
    );
  }

  if (loadState !== "ready") {
    const invalid = loadState === "invalid";
    return (
      <PublicShell>
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold">{invalid ? "This status link is not valid" : "Could not open the page"}</h1>
          <p className="mt-2 text-gray-600">{invalid ? "Please check the link, or call us." : "Please check your internet and try again."}</p>
          {!invalid && (
            <button type="button" onClick={load} className="mt-4 min-h-12 w-full rounded-xl bg-brand-navy px-4 text-lg font-semibold">
              <span className="text-white">Try again</span>
            </button>
          )}
        </div>
      </PublicShell>
    );
  }

  const currentIndex = Math.max(0, PUBLIC_STEPS.findIndex((step) => step.value === status.status));

  return (
    <PublicShell>
      <h1 className="text-2xl font-semibold">Complaint No. {status.number}</h1>
      <p className="mt-1 text-gray-600">Sent on {formatDate(status.raisedAt)}</p>

      {status.technicianName && status.visitDate && status.status !== "resolved" && (
        <p className="mt-4 rounded-2xl bg-white p-4 text-lg font-semibold shadow-sm">
          {status.technicianName} will visit on {formatDate(status.visitDate)}
        </p>
      )}

      <ol className="mt-5 space-y-2" aria-label="Progress">
        {PUBLIC_STEPS.map((step, index) => {
          const done = index < currentIndex;
          const current = index === currentIndex;
          return (
            <li
              key={step.value}
              aria-current={current ? "step" : undefined}
              className={`flex items-center gap-3 rounded-2xl p-3 ${current ? "border-2 border-brand-navy bg-white" : "bg-white/60"}`}
            >
              <span
                aria-hidden="true"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold ${
                  done || current ? "bg-brand-navy text-white" : "bg-gray-200 text-gray-500"
                }`}
              >
                {done ? "✓" : index + 1}
              </span>
              <span className="leading-tight">
                <span className={`block text-base ${current ? "font-semibold" : done ? "" : "text-gray-500"}`}>{step.label}</span>
                <span className="block text-sm text-gray-500">{step.hindi}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <button type="button" onClick={load} className="mt-5 min-h-12 w-full rounded-xl border-2 border-brand-navy px-4 text-lg font-semibold">
        <span className="text-brand-navy">Refresh</span>
      </button>
      <Link to="/complaint" className="mt-3 block text-center text-base text-brand-navy underline">
        Tell us about something else
      </Link>
    </PublicShell>
  );
}

export default PublicComplaintStatus;
