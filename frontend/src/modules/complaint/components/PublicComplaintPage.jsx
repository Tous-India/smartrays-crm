import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import BrandLogo from "../../../components/BrandLogo";
import { getPublicComplaintPage, raisePublicComplaint } from "../api/complaintApi";
import { CALLBACK_TIMES, CATEGORY_LABEL, COMPLAINT_CATEGORIES, PHOTO_LIMITS, PUBLIC_STATUS } from "../constants/complaint.constants";
import { shrinkPhoto } from "../utils/shrinkPhoto";

// Text colour goes on an inner <span>, never on the <button> itself: antd's
// global reset sets `button { color: inherit }` outside any CSS layer, which
// beats Tailwind's layered text-* utilities on a button element.

/**
 * `/c/:token` — the customer complaint page (2026-10-22). PUBLIC: no login,
 * reached from a link the customer got on WhatsApp/SMS. Built for a cheap
 * phone and a customer who is not technical: one screen, big buttons, plain
 * words with a short Hindi line, nothing to type but the problem itself.
 *
 * Shows the customer's name and their own complaints' status — nothing else
 * the server knows about them.
 */

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function StatusPill({ status }) {
  const meta = PUBLIC_STATUS[status] || PUBLIC_STATUS.received;
  return (
    <span
      className="inline-flex flex-col items-end rounded-lg px-3 py-1 text-right text-sm font-semibold leading-tight"
      style={{ color: meta.color, background: meta.background }}
    >
      {meta.label}
      <span className="text-xs font-normal">{meta.hindi}</span>
    </span>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-[#f3f5f9] px-4 py-5 text-[#1f2937]">
      <div className="mx-auto w-full max-w-md">
        <BrandLogo layout="horizontal" className="mb-5 w-40" />
        {children}
        <p className="mt-8 text-center text-xs text-gray-500">Smartrays Solutions · Rooftop solar</p>
      </div>
    </div>
  );
}

function PublicComplaintPage() {
  const { token } = useParams();
  const [page, setPage] = useState(null); // { customerName, complaints }
  const [loadState, setLoadState] = useState("loading"); // loading | ready | invalid | error

  const [category, setCategory] = useState(null);
  const [description, setDescription] = useState("");
  const [callbackTime, setCallbackTime] = useState("anytime");
  const [photos, setPhotos] = useState([]);
  const [formError, setFormError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(null); // { number }
  const photoInput = useRef(null);

  const load = useCallback(async () => {
    try {
      const response = await getPublicComplaintPage(token);
      setPage(response.data.data);
      setLoadState("ready");
    } catch (error) {
      setLoadState(error.response?.status === 404 ? "invalid" : "error");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function addPhotos(event) {
    const picked = Array.from(event.target.files || []);
    event.target.value = "";
    setFormError("");

    const room = PHOTO_LIMITS.maxCount - photos.length;
    if (picked.length > room) {
      setFormError(`You can add up to ${PHOTO_LIMITS.maxCount} photos.`);
    }

    const shrunk = await Promise.all(picked.slice(0, Math.max(0, room)).map(shrinkPhoto));
    const tooBig = shrunk.find((file) => file.size > PHOTO_LIMITS.maxBytes);
    if (tooBig) {
      setFormError("One photo is too large. Please choose a smaller photo.");
    }
    setPhotos((current) => [...current, ...shrunk.filter((file) => file.size <= PHOTO_LIMITS.maxBytes)]);
  }

  async function submit(event) {
    event.preventDefault();
    setFormError("");

    if (!category) {
      setFormError("Please choose what the problem is about.");
      return;
    }
    if (description.trim().length < 5) {
      setFormError("Please tell us a little more about the problem.");
      return;
    }

    const form = new FormData();
    form.append("category", category);
    form.append("description", description.trim());
    form.append("callbackTime", callbackTime);
    photos.forEach((photo) => form.append("photos", photo));

    setIsSending(true);
    try {
      const response = await raisePublicComplaint(token, form);
      setSent({ number: response.data.data.number });
      setCategory(null);
      setDescription("");
      setPhotos([]);
      setCallbackTime("anytime");
      load();
      window.scrollTo?.({ top: 0, behavior: "smooth" });
    } catch (error) {
      setFormError(error.response?.data?.message || "Could not send. Please check your internet and try again.");
    } finally {
      setIsSending(false);
    }
  }

  if (loadState === "loading") {
    return (
      <Shell>
        <p className="py-16 text-center text-gray-500">Loading…</p>
      </Shell>
    );
  }

  if (loadState === "invalid") {
    return (
      <Shell>
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold">This link is not valid</h1>
          <p className="mt-2 text-gray-600">Please ask Smartrays to send you a new link.</p>
          <p className="mt-1 text-gray-600">कृपया Smartrays से नया लिंक माँगें।</p>
        </div>
      </Shell>
    );
  }

  if (loadState === "error") {
    return (
      <Shell>
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold">Could not open the page</h1>
          <p className="mt-2 text-gray-600">Please check your internet and try again.</p>
          <button type="button" onClick={load} className="mt-4 min-h-12 w-full rounded-xl bg-brand-navy px-4 text-lg font-semibold">
            <span className="text-white">Try again</span>
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-2xl font-semibold leading-snug">Hello, {page.customerName}</h1>
      <p className="mt-1 text-gray-600">Tell us about a problem. We will call you back.</p>
      <p className="text-sm text-gray-500">समस्या बताइए — हम आपको फ़ोन करेंगे।</p>

      {sent ? (
        <div role="status" className="mt-5 rounded-2xl border-2 border-brand-green bg-white p-5">
          <p className="text-lg font-semibold text-brand-green">✓ Complaint received</p>
          <p className="mt-1 text-3xl font-bold">No. {sent.number}</p>
          <p className="mt-2 text-gray-700">Please keep this number. You can open this same link any time to see the status.</p>
          <p className="mt-1 text-sm text-gray-500">यह नंबर संभाल कर रखें। स्थिति देखने के लिए यही लिंक फिर खोलें।</p>
          <button type="button" onClick={() => setSent(null)} className="mt-4 min-h-12 w-full rounded-xl border-2 border-brand-navy px-4 text-lg font-semibold">
            <span className="text-brand-navy">Report another problem</span>
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-6" noValidate>
          <fieldset>
            <legend className="text-lg font-semibold">1. What is the problem about?</legend>
            <p className="mb-3 text-sm text-gray-500">समस्या किस बारे में है?</p>
            <div className="grid grid-cols-2 gap-3">
              {COMPLAINT_CATEGORIES.map((option) => {
                const selected = category === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCategory(option.value)}
                    className={`flex min-h-24 flex-col items-start rounded-2xl border-2 p-3 text-left transition ${
                      selected ? "border-brand-navy bg-[#e8eef8]" : "border-transparent bg-white shadow-sm"
                    }`}
                  >
                    <span aria-hidden="true" className="text-2xl">{option.icon}</span>
                    <span className="mt-1 text-base font-semibold leading-tight">{option.label}</span>
                    <span className="text-sm text-gray-500">{option.hindi}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="complaint-description" className="text-lg font-semibold">2. What happened?</label>
            <p className="mb-2 text-sm text-gray-500">क्या हुआ? (हिंदी में भी लिख सकते हैं)</p>
            <textarea
              id="complaint-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="For example: the inverter shows a red light since this morning."
              className="w-full rounded-2xl border-2 border-gray-200 bg-white p-3 text-base focus:border-brand-navy focus:outline-none"
            />
          </div>

          <div>
            <p className="text-lg font-semibold">3. Photos <span className="font-normal text-gray-500">(optional)</span></p>
            <p className="mb-2 text-sm text-gray-500">फ़ोटो (अगर हो तो) — up to {PHOTO_LIMITS.maxCount}</p>
            {photos.length > 0 && (
              <ul className="mb-2 space-y-2">
                {photos.map((photo, index) => (
                  <li key={`${photo.name}-${index}`} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 shadow-sm">
                    <span className="truncate pr-2 text-sm">📷 Photo {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                      className="min-h-10 rounded-lg px-3 text-sm font-semibold"
                    >
                      <span className="text-red-700">Remove</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {photos.length < PHOTO_LIMITS.maxCount && (
              <>
                <input ref={photoInput} type="file" accept="image/*" multiple onChange={addPhotos} className="hidden" data-testid="photo-input" />
                <button
                  type="button"
                  onClick={() => photoInput.current?.click()}
                  className="min-h-12 w-full rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 text-base font-semibold"
                >
                  <span className="text-gray-700">📷 Add a photo</span>
                </button>
              </>
            )}
          </div>

          <fieldset>
            <legend className="text-lg font-semibold">4. When should we call you?</legend>
            <p className="mb-3 text-sm text-gray-500">हम कब फ़ोन करें?</p>
            <div className="grid grid-cols-2 gap-2">
              {CALLBACK_TIMES.map((option) => {
                const selected = callbackTime === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCallbackTime(option.value)}
                    className={`min-h-14 rounded-xl border-2 px-2 text-center leading-tight ${
                      selected ? "border-brand-navy bg-[#e8eef8] font-semibold" : "border-transparent bg-white shadow-sm"
                    }`}
                  >
                    {option.label}
                    {option.detail && <span className="block text-xs text-gray-500">{option.detail}</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {formError && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-base text-red-800">{formError}</p>
          )}

          <button
            type="submit"
            disabled={isSending}
            className="min-h-14 w-full rounded-2xl bg-brand-navy px-4 text-lg font-semibold disabled:opacity-60"
          >
            <span className="text-white">{isSending ? "Sending…" : "Send complaint"}</span>
          </button>
        </form>
      )}

      {page.complaints.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Your complaints</h2>
          <p className="mb-3 text-sm text-gray-500">आपकी शिकायतें</p>
          <ul className="space-y-2">
            {page.complaints.map((complaint) => (
              <li key={complaint.number} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3 shadow-sm">
                <div className="min-w-0">
                  <p className="font-semibold">No. {complaint.number}</p>
                  <p className="truncate text-sm text-gray-600">
                    {CATEGORY_LABEL[complaint.category] || "Complaint"} · {formatDate(complaint.raisedAt)}
                  </p>
                </div>
                <StatusPill status={complaint.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}

export default PublicComplaintPage;
