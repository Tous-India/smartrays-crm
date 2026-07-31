import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { ConfigProvider, App as AntApp } from "antd";
import router from "./routes/router";
import useSessionStore from "./store/sessionStore";

// Smartrays Solutions brand — navy as the primary color so every AntD
// component (buttons, links, focus rings, selected menu items, form
// validation highlight) picks it up app-wide, not just the elements styled
// directly with Tailwind's brand-navy/brand-green utility classes (see
// src/styles/index.css's @theme block, kept in sync with this).
//
// `components.Select`/`components.Table` override tokens AntD derives from
// `colorPrimary` by default (Select's `optionSelectedBg`/`optionActiveBg`,
// Table's `rowSelectedBg`/`rowSelectedHoverBg` — both literally alias the
// same underlying `controlItemBgActive`/`controlItemBgActiveHover` tokens)
// — with this navy as the seed, that derivation lands on a muddy,
// low-contrast grey-blue (~rgb(173,179,184)) for a dropdown's selected
// option AND a table's selected row, found while checking the Leads status
// dropdown/Add Lead form (Select) and the Leads table's checkbox row
// selection (Table). Restored to AntD's own stock light-theme values here
// so every Select and Table selection app-wide gets a readable background
// instead — the same pale blue for both, since they're the same "selected"
// affordance conceptually.
const BRAND_THEME = {
  token: {
    colorPrimary: "#163b78",
    colorLink: "#163b78",
    borderRadius: 8,
  },
  components: {
    Select: {
      optionSelectedBg: "#e6f4ff",
      optionActiveBg: "rgba(0, 0, 0, 0.04)",
    },
    Table: {
      rowSelectedBg: "#e6f4ff",
      rowSelectedHoverBg: "#bae0ff",
    },
  },
};

function App() {
  const initializeSession = useSessionStore((state) => state.initializeSession);

  // Runs once on app load: the DB (via GET /auth/me), never a decoded JWT,
  // is the single source of truth for who's logged in (§4.1) — the token
  // itself lives in an httpOnly cookie the JS layer can't read anyway.
  useEffect(() => {
    initializeSession();
  }, [initializeSession]);

  return (
    <ConfigProvider theme={BRAND_THEME}>
      {/* Without this, every static `message.xxx()`/`notification.xxx()` call
          across the app (imported directly from "antd", not via a hook) fails
          to render at all under this custom theme — not just the console's
          "Static function can not consume context" warning, an actual silent
          failure. Found 2026-07-31 while diagnosing a reported "Deactivate
          does nothing" bug: the guard rejection's `message.error(...)` call
          fired and got the right text, but zero toast ever reached the DOM. */}
      <AntApp>
        <RouterProvider router={router} />
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
