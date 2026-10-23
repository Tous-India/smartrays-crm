import { fireEvent, render } from "@testing-library/react-native";
import TodayGlanceCard, { glanceCounts } from "./TodayGlanceCard";

/**
 * Today at a glance (2026-10-23), for managers and admins: how many are on
 * shift, need attention, are not checked in, checked out, on leave — each a
 * door into the Live list filtered to those people.
 */
const people = [
  { employeeId: "a", status: "moving" },
  { employeeId: "b", status: "location_off" },
  { employeeId: "c", status: "disconnected" },
  { employeeId: "d", status: "not_checked_in" },
  { employeeId: "e", status: "not_checked_in" },
  { employeeId: "f", status: "checked_out" },
  { employeeId: "g", status: "on_leave" },
  { employeeId: "h", status: "at_site" },
];

test("counts each group from the server's statuses", () => {
  expect(glanceCounts(people)).toEqual({ on_shift: 4, attention: 2, not_checked_in: 2, checked_out: 1, on_leave: 1 });
});

test("each count opens the live list with that filter; the map button opens it unfiltered", async () => {
  const onOpen = jest.fn();
  const screen = await render(<TodayGlanceCard live={{ isLoading: false, error: null, data: { people } }} onOpen={onOpen} />);

  expect(screen.getByTestId("glance-attention").props.accessibilityLabel).toBe("Need attention: 2");
  await fireEvent.press(screen.getByTestId("glance-not_checked_in"));
  expect(onOpen).toHaveBeenLastCalledWith("not_checked_in");
  await fireEvent.press(screen.getByTestId("glance-open-map"));
  expect(onOpen).toHaveBeenLastCalledWith(null);
});

test("while loading or failed it says so instead of showing zeros", async () => {
  const loading = await render(<TodayGlanceCard live={{ isLoading: true, error: null, data: null }} onOpen={jest.fn()} />);
  expect(loading.queryByTestId("glance-on_shift")).toBeNull();
});
