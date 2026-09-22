import { create } from "zustand";

/**
 * The foreground notice (STEP 4): a message that arrived while the app was
 * open is shown as a banner inside the app instead of a system notification
 * — the phone is in the user's hand, and a tap on the banner goes where a
 * tap on the notification would. Global because the banner sits above the
 * navigator, and the listener that fills it lives outside any screen.
 */
const usePushStore = create((set) => ({
  notice: null,

  showNotice: (notice) => set({ notice }),
  dismissNotice: () => set({ notice: null }),
}));

export default usePushStore;
