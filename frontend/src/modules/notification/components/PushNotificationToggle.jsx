import { useCallback, useEffect, useState } from "react";
import { Alert, Switch, Typography, App } from "antd";
import {
  disablePush,
  enablePush,
  getExistingSubscription,
  getPermissionState,
  getVapidPublicKey,
  isPushSupported,
} from "../pushSubscription";

const { Text } = Typography;

/**
 * Settings → Account: browser push opt-in (§6.7, 2026-08-07).
 *
 * **The prompt lives here, not on app load.** Browsers penalise sites that
 * ask for notification permission unprompted, and users reflexively deny a
 * prompt they did not invite — a denial is terminal, so asking badly once
 * costs push permanently for that user. The service worker still registers on
 * load; registration prompts for nothing.
 *
 * Four states, each rendered honestly:
 * - **unsupported** — no `serviceWorker`/`PushManager`: nothing renders at
 *   all, rather than a control that would error on click.
 * - **not configured** — `VITE_VAPID_PUBLIC_KEY` absent: also renders
 *   nothing, because the toggle could not work. Same reasoning as the
 *   backend returning 503 when its cleanup secret is unset rather than
 *   running open.
 * - **denied** — cannot be re-prompted programmatically, so the switch is
 *   disabled and the text says to change it in browser settings. Showing an
 *   enabled-looking switch that silently does nothing would be worse.
 * - **default / granted** — a working switch.
 */
function PushNotificationToggle() {
  const { message } = App.useApp();
  const [permission, setPermission] = useState(() => getPermissionState());
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const supported = isPushSupported();
  const configured = Boolean(getVapidPublicKey());

  const refresh = useCallback(async () => {
    if (!supported) {
      return;
    }

    setPermission(getPermissionState());
    setIsSubscribed(Boolean(await getExistingSubscription()));
  }, [supported]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!supported || !configured) {
    return null;
  }

  async function handleChange(checked) {
    setIsBusy(true);

    try {
      if (checked) {
        const result = await enablePush();
        setPermission(result.permission);

        if (result.ok) {
          message.success("Push notifications enabled for this browser");
        } else if (result.reason === "denied") {
          message.error("Your browser blocked notifications for this site");
        } else if (result.reason === "dismissed") {
          message.info("Permission was not granted");
        } else {
          message.error("Could not enable push notifications");
        }
      } else {
        const result = await disablePush();
        message[result.ok ? "success" : "error"](
          result.ok ? "Push notifications disabled" : "Could not disable push notifications"
        );
      }
    } finally {
      await refresh();
      setIsBusy(false);
    }
  }

  const isDenied = permission === "denied";

  return (
    <div data-testid="push-toggle">
      <div className="mb-2 flex items-center justify-between gap-4">
        <div>
          <div className="font-medium">Push notifications</div>
          <Text type="secondary" className="text-xs">
            Get notified on this device even when Smartrays is closed.
          </Text>
        </div>
        <Switch
          checked={isSubscribed}
          disabled={isDenied || isBusy}
          loading={isBusy}
          onChange={handleChange}
          aria-label="Enable push notifications"
          data-testid="push-switch"
        />
      </div>

      {isDenied && (
        <Alert
          type="warning"
          showIcon
          data-testid="push-denied-notice"
          message="Notifications are blocked for this site"
          description="A blocked permission can't be re-requested by the app. Allow notifications for this site in your browser's settings, then reload this page."
        />
      )}
    </div>
  );
}

export default PushNotificationToggle;
