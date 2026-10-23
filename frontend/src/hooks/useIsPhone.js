import { useEffect, useState } from "react";

// Phone-width layouts (2026-10-23): below Tailwind's `md` breakpoint (768 px).
const PHONE_QUERY = "(max-width: 767px)";

function matchesPhone() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches;
}

/** True on a phone-width screen; follows rotation and window resizes. */
export function useIsPhone() {
  const [isPhone, setIsPhone] = useState(matchesPhone);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(PHONE_QUERY);
    const update = () => setIsPhone(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return isPhone;
}

export default useIsPhone;
