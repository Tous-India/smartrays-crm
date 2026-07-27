import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { ConfigProvider } from "antd";
import router from "./routes/router";
import useSessionStore from "./store/sessionStore";

// Smartrays Solutions brand — navy as the primary color so every AntD
// component (buttons, links, focus rings, selected menu items, form
// validation highlight) picks it up app-wide, not just the elements styled
// directly with Tailwind's brand-navy/brand-green utility classes (see
// src/styles/index.css's @theme block, kept in sync with this).
//
// `components.Select` overrides two tokens AntD derives from `colorPrimary`
// by default (`optionSelectedBg`/`optionActiveBg`) — with this navy as the
// seed, that derivation lands on a muddy, low-contrast grey-blue
// (~rgb(173,179,184)) for a dropdown's selected/hovered option, found while
// checking the Leads status dropdown and the Add Lead form's Select fields.
// Restored to AntD's own stock light-theme values here so every Select
// app-wide gets a readable option background instead.
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
      <RouterProvider router={router} />
    </ConfigProvider>
  );
}

export default App;
