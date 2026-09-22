import { fireEvent, render } from "@testing-library/react-native";
import ServicesDueCard from "./ServicesDueCard";

/** The summary under the shift card: counts, the first three, its own three states. */
const DAY = 24 * 60 * 60 * 1000;

function service(id, title, dueInDays) {
  return { _id: id, title, status: "todo", dueDate: dueInDays === null ? null : new Date(Date.now() + dueInDays * DAY).toISOString(), subtasks: [] };
}

test("overdue first, the first three by title, the rest counted, the overdue badge", async () => {
  const onOpen = jest.fn();
  const services = [service("a", "Soon", 2), service("b", "Late", -1), service("c", "Undated", null), service("d", "Later", 9), service("e", "Latest", 12)];
  const screen = await render(<ServicesDueCard services={services} isLoading={false} error={null} onOpen={onOpen} />);

  expect(screen.getByTestId("services-due-overdue").props.children).toBe("1 overdue");
  const rows = screen.getAllByTestId(/^services-due-row-/).map((row) => row.props.testID);
  expect(rows).toEqual(["services-due-row-b", "services-due-row-a", "services-due-row-d"]);
  expect(screen.getByText("and 2 more · tap to see all")).toBeTruthy();

  await fireEvent.press(screen.getByTestId("services-due-card"));
  expect(onOpen).toHaveBeenCalled();
});

test("nothing assigned says so", async () => {
  const screen = await render(<ServicesDueCard services={[]} isLoading={false} error={null} onOpen={() => {}} />);
  expect(screen.getByTestId("services-due-empty")).toBeTruthy();
});

test("still loading says so", async () => {
  const screen = await render(<ServicesDueCard services={[]} isLoading error={null} onOpen={() => {}} />);
  expect(screen.getByText("Loading…")).toBeTruthy();
});

test("a failed load shows the server's message", async () => {
  const error = new Error("boom");
  error.response = { status: 403, data: { message: "You do not have permission to view services" } };
  const screen = await render(<ServicesDueCard services={[]} isLoading={false} error={error} onOpen={() => {}} />);
  expect(screen.getByTestId("services-due-error").props.children).toBe("You do not have permission to view services");
});
