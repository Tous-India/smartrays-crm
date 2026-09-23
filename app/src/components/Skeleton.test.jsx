import { AccessibilityInfo } from "react-native";
import { render, waitFor } from "@testing-library/react-native";
import BootSplash from "react-native-bootsplash";
import ListState from "./ListState";
import { SkeletonBlock } from "./Skeleton";
import PrimaryButton from "./PrimaryButton";
import App from "../../App";

/**
 * The loading states: placeholders shaped like the rows, a button that keeps
 * its label beside its spinner, the OS "remove animations" setting honoured,
 * and the splash hidden only once the launch restore has answered.
 */
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("a loading list draws the asked-for number of placeholders, and nothing else", async () => {
  const screen = await render(<ListState isLoading skeleton="service" skeletonCount={4} testID="x" />);

  expect(screen.getByTestId("x-loading")).toBeTruthy();
  expect(screen.queryByTestId("x-empty")).toBeNull();
  expect(screen.queryByTestId("x-error")).toBeNull();
  expect(screen.getByTestId("x-loading").children).toHaveLength(4);
});

test("placeholders are hidden from assistive technology", async () => {
  const screen = await render(<SkeletonBlock width={100} testID="block" />);

  // A query that respects accessibility does not see it at all — which is the
  // point: a screen reader should hear the real content, never the scaffolding.
  expect(screen.queryByTestId("block")).toBeNull();

  const block = screen.getByTestId("block", { includeHiddenElements: true });
  expect(block.props.accessibilityElementsHidden).toBe(true);
  expect(block.props.importantForAccessibility).toBe("no-hide-descendants");
});

test("with the OS asking for reduced motion, the placeholder never animates", async () => {
  AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(true);
  const screen = await render(<SkeletonBlock width={100} testID="block" />);

  await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled());

  // The opacity is a plain 1 — the loop never started, so nothing is driving it.
  const block = screen.getByTestId("block", { includeHiddenElements: true });
  const flat = [block.props.style].flat(Infinity).filter(Boolean);
  const opacity = flat.map((entry) => entry.opacity).find((value) => value !== undefined);
  expect(opacity?.__getValue ? opacity.__getValue() : opacity).toBe(1);
});

test("a loading button keeps its label beside the spinner, and stays disabled", async () => {
  const screen = await render(<PrimaryButton title="Check in" loading onPress={() => {}} testID="btn" />);

  expect(screen.getByText("Check in")).toBeTruthy();
  expect(screen.getByTestId("btn").props.accessibilityState).toMatchObject({ disabled: true, busy: true });
});

test("the launch splash is hidden only after the session restore answers", async () => {
  expect(BootSplash.hide).not.toHaveBeenCalled();

  const screen = await render(<App />);

  await screen.findByTestId("login-screen");
  await waitFor(() => expect(BootSplash.hide).toHaveBeenCalledWith({ fade: true }));
  expect(BootSplash.hide).toHaveBeenCalledTimes(1);
});
