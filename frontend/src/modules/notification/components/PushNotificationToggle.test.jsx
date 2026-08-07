import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PushNotificationToggle from "./PushNotificationToggle";
import * as push from "../pushSubscription";

/**
 * §6.7 (2026-08-07) — Settings → Account push toggle.
 *
 * The subscription module is mocked so these assert what the CONTROL does
 * with each state. Whether push actually works is a browser question, not a
 * jsdom one.
 */

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  const mockMessage = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage });
  return { ...actual, message: mockMessage };
});

vi.mock("../pushSubscription", () => ({
  isPushSupported: vi.fn(),
  getPermissionState: vi.fn(),
  getVapidPublicKey: vi.fn(),
  getExistingSubscription: vi.fn(),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
}));

function setup({ supported = true, configured = true, permission = "default", subscribed = false } = {}) {
  push.isPushSupported.mockReturnValue(supported);
  push.getVapidPublicKey.mockReturnValue(configured ? "BKWphfvxobPJ" : null);
  push.getPermissionState.mockReturnValue(supported ? permission : "unsupported");
  push.getExistingSubscription.mockResolvedValue(subscribed ? { endpoint: "e" } : null);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PushNotificationToggle — when it renders at all", () => {
  it("renders NOTHING on a browser without push support", () => {
    setup({ supported: false });

    const { container } = render(<PushNotificationToggle />);

    // A control that errors on click is worse than no control.
    expect(container).toBeEmptyDOMElement();
  });

  it("renders NOTHING when the VAPID public key is not configured", () => {
    setup({ configured: false });

    const { container } = render(<PushNotificationToggle />);

    // Same reasoning as the backend's cleanup endpoint returning 503 when its
    // secret is unset: refuse visibly rather than offer something that cannot
    // work.
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the switch when supported and configured", async () => {
    setup();

    render(<PushNotificationToggle />);

    expect(await screen.findByTestId("push-switch")).toBeInTheDocument();
  });
});

describe("PushNotificationToggle — permission states", () => {
  it("shows the switch OFF and enabled when permission has not been asked", async () => {
    setup({ permission: "default" });

    render(<PushNotificationToggle />);

    const toggle = await screen.findByTestId("push-switch");
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(toggle).not.toBeDisabled();
    expect(screen.queryByTestId("push-denied-notice")).not.toBeInTheDocument();
  });

  it("shows the switch ON when already subscribed", async () => {
    setup({ permission: "granted", subscribed: true });

    render(<PushNotificationToggle />);

    await waitFor(() => expect(screen.getByTestId("push-switch")).toBeChecked());
  });

  it("DISABLES the switch and explains when permission is denied", async () => {
    setup({ permission: "denied" });

    render(<PushNotificationToggle />);

    // A denied permission cannot be re-requested programmatically, so an
    // enabled-looking control would silently do nothing.
    await waitFor(() => expect(screen.getByTestId("push-switch")).toBeDisabled());
    expect(screen.getByTestId("push-denied-notice")).toBeInTheDocument();
    expect(screen.getByText(/browser's settings/i)).toBeInTheDocument();
  });
});

describe("PushNotificationToggle — enabling and disabling", () => {
  it("subscribes when switched on", async () => {
    setup({ permission: "default" });
    push.enablePush.mockResolvedValue({ ok: true, permission: "granted", reason: "subscribed" });

    render(<PushNotificationToggle />);
    await userEvent.click(await screen.findByTestId("push-switch"));

    await waitFor(() => expect(push.enablePush).toHaveBeenCalled());
  });

  it("unsubscribes when switched off", async () => {
    setup({ permission: "granted", subscribed: true });
    push.disablePush.mockResolvedValue({ ok: true, reason: "unsubscribed" });

    render(<PushNotificationToggle />);
    await waitFor(() => expect(screen.getByTestId("push-switch")).toBeChecked());
    await userEvent.click(screen.getByTestId("push-switch"));

    await waitFor(() => expect(push.disablePush).toHaveBeenCalled());
  });

  it("reflects a denial made at the prompt, without leaving the switch on", async () => {
    setup({ permission: "default" });
    push.enablePush.mockResolvedValue({ ok: false, permission: "denied", reason: "denied" });
    push.getPermissionState.mockReturnValue("denied");

    render(<PushNotificationToggle />);
    await userEvent.click(await screen.findByTestId("push-switch"));

    await waitFor(() => expect(screen.getByTestId("push-denied-notice")).toBeInTheDocument());
    expect(screen.getByTestId("push-switch")).not.toBeChecked();
  });

  it("never prompts on render — only on the user's click", async () => {
    setup({ permission: "default" });

    render(<PushNotificationToggle />);
    await screen.findByTestId("push-switch");

    // Prompting on load is what gets sites reflexively denied, and a denial
    // is terminal.
    expect(push.enablePush).not.toHaveBeenCalled();
  });
});
