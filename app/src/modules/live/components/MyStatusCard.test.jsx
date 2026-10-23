import { Linking } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import MyStatusCard from "./MyStatusCard";
import { FALLBACK_META } from "../live.utils";

/**
 * "What the office sees": the employee's own status as their manager sees
 * it, and a fix-it button that opens the right phone setting.
 */
describe("MyStatusCard", () => {
  test("location off → the status in plain words and a button that opens the location settings", async () => {
    const sendIntent = jest.spyOn(Linking, "sendIntent").mockResolvedValue();
    const screen = await render(<MyStatusCard status={{ status: "location_off", since: new Date().toISOString(), fix: "turn_on_location" }} meta={FALLBACK_META} />);

    expect(screen.getByTestId("my-status").props.children).toBe("Location off");
    expect(screen.getByTestId("my-status-fix-text").props.children).toMatch(/Location is off on your phone/);
    await fireEvent.press(screen.getByTestId("my-status-fix"));
    expect(sendIntent).toHaveBeenCalledWith("android.settings.LOCATION_SOURCE_SETTINGS");
  });

  test("disconnected → 'Check tracking' runs the caller's handler", async () => {
    const onCheckTracking = jest.fn();
    const screen = await render(<MyStatusCard status={{ status: "disconnected", lastSyncAt: new Date().toISOString(), fix: "open_app" }} meta={FALLBACK_META} onCheckTracking={onCheckTracking} />);

    await fireEvent.press(screen.getByTestId("my-status-fix"));
    expect(onCheckTracking).toHaveBeenCalled();
  });

  test("battery low → a message, no button; all fine → no fix at all", async () => {
    const low = await render(<MyStatusCard status={{ status: "moving", battery: 9, batteryLow: true, fix: "charge_phone" }} meta={FALLBACK_META} />);
    expect(low.getByTestId("my-status-fix-text").props.children).toMatch(/charge your phone/);
    expect(low.queryByTestId("my-status-fix")).toBeNull();

    const fine = await render(<MyStatusCard status={{ status: "at_site", place: "Sharma Residence", fix: null }} meta={FALLBACK_META} />);
    expect(fine.getByTestId("my-status").props.children).toBe("At site");
    expect(fine.queryByTestId("my-status-fix-text")).toBeNull();
  });

  test("not on a shift → nothing", async () => {
    const screen = await render(<MyStatusCard status={{ status: "checked_out" }} meta={FALLBACK_META} />);
    expect(screen.queryByTestId("my-status-card")).toBeNull();
  });
});
