import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PublicShell from "./PublicShell";
import { checkComplaintPhone, getComplaintLinkPrefill, submitPublicComplaint } from "../api/complaintApi";
import { CALLBACK_TIMES, PHOTO_LIMITS, REQUEST_KINDS } from "../constants/complaint.constants";
import { shrinkPhoto } from "../utils/shrinkPhoto";
import { normalizeMobile } from "../utils/phone";

/**
 * `/complaint` — the public complaint form (2026-10-23). ONE link for every
 * customer, shared on WhatsApp/SMS; no login. Built for a cheap phone and a
 * customer who is not technical: big buttons, plain words with a short Hindi
 * line. First choice: a complaint (goes to the complaints team) or a new
 * requirement (goes to sales as a lead). After sending a complaint, the
 * customer gets its number and a status link to keep.
 *
 * Phone first (2026-10-23): once the 10 digits are in, the server says only
 * whether it is a known customer. Known → nothing more to say who they are
 * (the address is optional — it is on file). Not known → "Company or
 * household name" and the address are required. Nothing about the customer
 * is ever shown back.
 *
 * `/c/:token` — a customer's OWN link (`linkToken`): the form comes prefilled
 * and greets them; no phone check, no company name.
 */

const INPUT = "min-h-12 w-full rounded-xl border-2 border-gray-200 bg-white px-3 text-base focus:border-brand-navy focus:outline-none";

function PublicComplaintForm({ linkToken: linkTokenProp = null }) {
  // `/c/:token` passes the code in the URL; tests may pass it directly.
  const { token } = useParams();
  const linkToken = linkTokenProp ?? token ?? null;
  const [kind, setKind] = useState(null);
  const [prefill, setPrefill] = useState(null); // a customer's own link: { customerName, … }
  const [linkState, setLinkState] = useState(linkToken ? "loading" : "none"); // none | loading | ready | invalid | error
  const [checked, setChecked] = useState({ mobile: null, matched: null }); // the last answer, and for which number
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [location, setLocation] = useState(null); // { lat, lng, accuracy }
  const [locationState, setLocationState] = useState("idle"); // idle | finding | failed
  const [description, setDescription] = useState("");
  const [callbackTime, setCallbackTime] = useState("anytime");
  const [photos, setPhotos] = useState([]);
  const [formError, setFormError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(null); // { kind, number?, statusToken? }
  const photoInput = useRef(null);

  const isComplaint = kind === "complaint";
  const mobile = normalizeMobile(phone);
  // idle (number not complete) | checking | matched | unmatched
  const phoneCheck = linkToken || !mobile ? "idle" : checked.mobile !== mobile ? "checking" : checked.matched ? "matched" : "unmatched";
  const needsCompany = !linkToken && phoneCheck === "unmatched";
  const addressRequired = !linkToken && phoneCheck !== "matched";

  // A customer's own link: fill in what we know.
  useEffect(() => {
    if (!linkToken) return;
    getComplaintLinkPrefill(linkToken)
      .then((response) => {
        const data = response.data.data;
        setPrefill(data);
        setName(data.contactName || "");
        setPhone(data.phone || "");
        setAddress(data.address || "");
        setLinkState("ready");
      })
      .catch((error) => setLinkState(error.response?.status === 404 ? "invalid" : "error"));
  }, [linkToken]);

  // Once the number is complete, ask whether it is a known customer. A failed
  // check asks for the name anyway — the server decides in the end.
  useEffect(() => {
    if (linkToken || !mobile) return undefined;
    let cancelled = false;
    checkComplaintPhone(mobile)
      .then((response) => !cancelled && setChecked({ mobile, matched: Boolean(response.data.data.matched) }))
      .catch(() => !cancelled && setChecked({ mobile, matched: false }));
    return () => {
      cancelled = true;
    };
  }, [mobile, linkToken]);

  function findLocation() {
    if (!navigator.geolocation) {
      setLocationState("failed");
      return;
    }
    setLocationState("finding");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
        });
        setLocationState("idle");
      },
      () => setLocationState("failed"),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
    );
  }

  async function addPhotos(event) {
    const picked = Array.from(event.target.files || []);
    event.target.value = "";
    setFormError("");

    const room = PHOTO_LIMITS.maxCount - photos.length;
    if (picked.length > room) {
      setFormError(`You can add up to ${PHOTO_LIMITS.maxCount} photos.`);
    }
    const shrunk = await Promise.all(picked.slice(0, Math.max(0, room)).map(shrinkPhoto));
    if (shrunk.some((file) => file.size > PHOTO_LIMITS.maxBytes)) {
      setFormError("One photo is too large. Please choose a smaller photo.");
    }
    setPhotos((current) => [...current, ...shrunk.filter((file) => file.size <= PHOTO_LIMITS.maxBytes)]);
  }

  function check() {
    if (!kind) return "Please choose: a complaint, or a new requirement.";
    if (!mobile) return "Please enter your 10-digit mobile number.";
    if (needsCompany && !companyName.trim()) return "Please enter your company or household name.";
    if (!name.trim()) return "Please enter your name.";
    if (addressRequired && address.trim().length < 5) return "Please enter your address.";
    if (description.trim().length < 5) return "Please tell us a little more.";
    return "";
  }

  async function submit(event) {
    event.preventDefault();
    const problem = check();
    setFormError(problem);
    if (problem) return;

    const form = new FormData();
    form.append("kind", kind);
    form.append("name", name.trim());
    form.append("phone", phone.trim());
    if (address.trim()) form.append("address", address.trim());
    if (needsCompany) form.append("companyName", companyName.trim());
    if (linkToken) form.append("linkToken", linkToken);
    form.append("description", description.trim());
    form.append("callbackTime", callbackTime);
    if (location) {
      form.append("lat", String(location.lat));
      form.append("lng", String(location.lng));
      form.append("locationAccuracy", String(location.accuracy));
    }
    if (isComplaint) photos.forEach((photo) => form.append("photos", photo));

    setIsSending(true);
    try {
      const response = await submitPublicComplaint(form);
      setSent(response.data.data);
      window.scrollTo?.({ top: 0, behavior: "smooth" });
    } catch (error) {
      setFormError(error.response?.data?.message || "Could not send. Please check your internet and try again.");
    } finally {
      setIsSending(false);
    }
  }

  function startAgain() {
    setSent(null);
    setKind(null);
    setDescription("");
    setPhotos([]);
    setCallbackTime("anytime");
  }

  if (sent?.kind === "complaint") {
    const statusPath = `/complaint/status/${sent.statusToken}`;
    return (
      <PublicShell>
        <div role="status" className="rounded-2xl border-2 border-brand-green bg-white p-5">
          <p className="text-lg font-semibold text-brand-green">✓ Complaint received</p>
          <p className="text-sm text-gray-500">शिकायत मिल गई</p>
          <p className="mt-2 text-3xl font-bold">No. {sent.number}</p>
          <p className="mt-2 text-gray-700">We will call you soon. Keep this number, and save the link below to see the status any time.</p>
          <p className="mt-1 text-sm text-gray-500">यह नंबर संभाल कर रखें। स्थिति देखने के लिए नीचे का लिंक सेव करें।</p>
          {/* Background inline and colour on the span: antd's unlayered reset
              (`a { background-color: transparent; color: … }`) beats Tailwind's
              bg-/text- utilities on a link — it rendered white on white. */}
          <Link
            to={statusPath}
            className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl px-4 text-lg font-semibold"
            style={{ backgroundColor: "#163b78" }}
          >
            <span className="text-white">See the status</span>
          </Link>
          <p className="mt-2 break-all text-center text-xs text-gray-500">
            {typeof window !== "undefined" ? `${window.location.origin}${statusPath}` : statusPath}
          </p>
          <button type="button" onClick={startAgain} className="mt-4 min-h-12 w-full rounded-xl border-2 border-brand-navy px-4 text-lg font-semibold">
            <span className="text-brand-navy">Send another</span>
          </button>
        </div>
      </PublicShell>
    );
  }

  if (sent?.kind === "requirement") {
    return (
      <PublicShell>
        <div role="status" className="rounded-2xl border-2 border-brand-green bg-white p-5">
          <p className="text-lg font-semibold text-brand-green">✓ Thank you, {name.trim()}</p>
          <p className="mt-2 text-gray-700">Our sales team will call you about your requirement.</p>
          <p className="mt-1 text-sm text-gray-500">हमारी सेल्स टीम आपको फ़ोन करेगी।</p>
          <button type="button" onClick={startAgain} className="mt-4 min-h-12 w-full rounded-xl border-2 border-brand-navy px-4 text-lg font-semibold">
            <span className="text-brand-navy">Send another</span>
          </button>
        </div>
      </PublicShell>
    );
  }

  if (linkState === "loading") {
    return (
      <PublicShell>
        <p className="py-16 text-center text-gray-500">Loading…</p>
      </PublicShell>
    );
  }

  if (linkState === "invalid" || linkState === "error") {
    const invalid = linkState === "invalid";
    return (
      <PublicShell>
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold">{invalid ? "This link is not valid" : "Could not open the page"}</h1>
          <p className="mt-2 text-gray-600">{invalid ? "Please ask Smartrays for a new link." : "Please check your internet and try again."}</p>
          {invalid && <p className="mt-1 text-gray-600">कृपया Smartrays से नया लिंक माँगें।</p>}
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <h1 className="text-2xl font-semibold leading-snug">{prefill ? `Hello, ${prefill.customerName}` : "How can we help?"}</h1>
      <p className="mt-1 text-gray-600">Tell us here. We will call you back.</p>
      <p className="text-sm text-gray-500">यहाँ बताइए — हम आपको फ़ोन करेंगे।</p>

      <form onSubmit={submit} className="mt-5 space-y-6" noValidate>
        <fieldset>
          <legend className="text-lg font-semibold">1. What is it about?</legend>
          <p className="mb-3 text-sm text-gray-500">किस बारे में है?</p>
          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            {REQUEST_KINDS.map((option) => {
              const selected = kind === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setKind(option.value)}
                  className={`flex min-h-28 flex-col items-start rounded-2xl border-2 p-3 text-left transition ${
                    selected ? "border-brand-navy bg-[#e8eef8]" : "border-transparent bg-white shadow-sm"
                  }`}
                >
                  <span aria-hidden="true" className="text-2xl">{option.icon}</span>
                  <span className="mt-1 text-base font-semibold leading-tight">{option.label}</span>
                  <span className="text-sm text-gray-500">{option.hindi}</span>
                  <span className="mt-1 text-xs text-gray-500">{option.hint}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="space-y-3">
          <p className="text-lg font-semibold">2. Your details</p>
          <div>
            <label htmlFor="complaint-phone" className="mb-1 block text-sm text-gray-700">Phone number · फ़ोन नंबर</label>
            <input
              id="complaint-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={20}
              autoComplete="tel"
              placeholder="98xxx xxxxx"
              className={INPUT}
            />
            {phoneCheck === "checking" && <p className="mt-1 text-sm text-gray-500">Checking…</p>}
          </div>
          {needsCompany && (
            <div>
              <label htmlFor="complaint-company" className="mb-1 block text-sm text-gray-700">
                Company or household name · कंपनी या घर का नाम
              </label>
              <input
                id="complaint-company"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                maxLength={120}
                autoComplete="organization"
                placeholder="e.g. Gupta Industries or Sharma residence"
                className={INPUT}
              />
            </div>
          )}
          <div>
            <label htmlFor="complaint-name" className="mb-1 block text-sm text-gray-700">Your name · आपका नाम</label>
            <input id="complaint-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" className={INPUT} />
          </div>
          <div>
            <label htmlFor="complaint-address" className="mb-1 block text-sm text-gray-700">
              {addressRequired ? "Address · पता" : "Address (optional) · पता"}
            </label>
            <textarea
              id="complaint-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={300}
              rows={2}
              autoComplete="street-address"
              placeholder="House no., street, area, city"
              className="w-full rounded-xl border-2 border-gray-200 bg-white p-3 text-base focus:border-brand-navy focus:outline-none"
            />
          </div>
          {location ? (
            <p className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm shadow-sm">
              <span className="text-brand-green">📍 Location added</span>
              <button type="button" onClick={() => setLocation(null)} className="min-h-10 rounded-lg px-3 font-semibold">
                <span className="text-red-700">Remove</span>
              </button>
            </p>
          ) : (
            <button
              type="button"
              onClick={findLocation}
              disabled={locationState === "finding"}
              className="min-h-12 w-full rounded-xl border-2 border-gray-300 bg-white px-4 text-base font-semibold disabled:opacity-60"
            >
              <span className="text-gray-700">{locationState === "finding" ? "Finding your location…" : "📍 Use my current location"}</span>
            </button>
          )}
          {locationState === "failed" && (
            <p className="text-sm text-gray-600">Could not get your location. Your typed address is enough.</p>
          )}
        </div>

        <div>
          <label htmlFor="complaint-description" className="text-lg font-semibold">
            3. {kind === "requirement" ? "What do you need?" : "What happened?"}
          </label>
          <p className="mb-2 text-sm text-gray-500">
            {kind === "requirement" ? "आपको क्या चाहिए?" : "क्या हुआ?"} (हिंदी में भी लिख सकते हैं)
          </p>
          <textarea
            id="complaint-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={4}
            placeholder={kind === "requirement" ? "For example: 2 more panels on the roof." : "For example: the inverter shows a red light since this morning."}
            className="w-full rounded-2xl border-2 border-gray-200 bg-white p-3 text-base focus:border-brand-navy focus:outline-none"
          />
        </div>

        {isComplaint && (
          <div>
            <p className="text-lg font-semibold">Photos <span className="font-normal text-gray-500">(optional)</span></p>
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
        )}

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
                  <span className="block text-xs text-gray-500">
                    {option.hindi}
                    {option.detail ? ` · ${option.detail}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {formError && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-base text-red-800">{formError}</p>
        )}

        <button type="submit" disabled={isSending} className="min-h-14 w-full rounded-2xl bg-brand-navy px-4 text-lg font-semibold disabled:opacity-60">
          <span className="text-white">{isSending ? "Sending…" : "Send"}</span>
        </button>
      </form>
    </PublicShell>
  );
}

export default PublicComplaintForm;
