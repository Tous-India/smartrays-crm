import { Platform } from "react-native";

/**
 * Manufacturers whose battery managers kill background services stock
 * Android would keep (app-plan.md §1.4; reference: dontkillmyapp.com). Each
 * entry names the switch in that vendor's own words so the guidance screen
 * can say where to look. There is no API to read those switches — the app
 * can only open the settings and ask.
 */
const OEM_GUIDANCE = {
  xiaomi: {
    label: "Xiaomi / Redmi / POCO",
    steps: [
      "Settings → Apps → Manage apps → Smartrays → Autostart: ON",
      "Same screen → Battery saver: No restrictions",
      "Recents → long-press Smartrays → Lock",
    ],
  },
  oppo: {
    label: "OPPO",
    steps: [
      "Settings → Battery → App battery management → Smartrays → Allow background activity",
      "Settings → Apps → Smartrays → Auto-launch: ON",
    ],
  },
  realme: {
    label: "realme",
    steps: [
      "Settings → Battery → App battery management → Smartrays → Allow background activity",
      "Settings → Apps → Smartrays → Auto-launch: ON",
    ],
  },
  vivo: {
    label: "vivo / iQOO",
    steps: [
      "Settings → Battery → Background power consumption management → Smartrays: Allow",
      "i Manager → App manager → Autostart manager → Smartrays: ON",
    ],
  },
  oneplus: {
    label: "OnePlus",
    steps: [
      "Settings → Battery → Battery optimisation → Smartrays → Don't optimise",
      "Settings → Apps → Smartrays → Battery → Allow background activity",
    ],
  },
  samsung: {
    label: "Samsung",
    steps: [
      "Settings → Battery → Background usage limits → make sure Smartrays is NOT in Sleeping or Deep sleeping apps",
      "Settings → Apps → Smartrays → Battery → Unrestricted",
    ],
  },
};

const BRAND_ALIASES = { redmi: "xiaomi", poco: "xiaomi", iqoo: "vivo" };

function normalise(value) {
  return String(value || "").trim().toLowerCase();
}

/** The guidance for this phone, or null on stock-behaving hardware. */
export function getOemGuidance(constants = Platform.constants) {
  const candidates = [normalise(constants?.Manufacturer), normalise(constants?.Brand)];

  for (const candidate of candidates) {
    const key = BRAND_ALIASES[candidate] || candidate;

    if (OEM_GUIDANCE[key]) {
      return { key, ...OEM_GUIDANCE[key] };
    }
  }

  return null;
}
