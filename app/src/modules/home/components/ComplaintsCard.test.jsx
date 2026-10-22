import { fireEvent, render } from "@testing-library/react-native";
import ComplaintsCard from "./ComplaintsCard";

/** Customer complaints on Home (2026-10-22): open ones only, overdue counted, its own states. */
const HOUR = 3600000;
const ago = (hours) => new Date(Date.now() - hours * HOUR).toISOString();

const complaint = (id, customerName, status, ageHours, category = "technical") => ({ _id: id, customerName, status, createdAt: ago(ageHours), category });

test("lists the open complaints, overdue first, and counts the overdue ones", async () => {
  const onOpen = jest.fn();
  const screen = await render(
    <ComplaintsCard
      complaints={[complaint("a", "Fresh", "open", 1), complaint("b", "Late", "open", 6), complaint("c", "Done", "resolved", 50)]}
      isLoading={false}
      error={null}
      onOpen={onOpen}
    />
  );

  expect(screen.getByTestId("complaints-card-overdue").props.children).toBe("1 overdue");
  expect(screen.getByText("Late")).toBeTruthy();
  expect(screen.getByText("Fresh")).toBeTruthy();
  expect(screen.queryByText("Done")).toBeNull();

  await fireEvent.press(screen.getByTestId("complaints-card"));
  expect(onOpen).toHaveBeenCalled();
});

test("nothing open says so", async () => {
  const screen = await render(<ComplaintsCard complaints={[complaint("c", "Done", "resolved", 3)]} isLoading={false} error={null} onOpen={() => {}} />);
  expect(screen.getByTestId("complaints-card-empty")).toBeTruthy();
});
