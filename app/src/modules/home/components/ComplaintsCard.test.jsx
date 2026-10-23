import { fireEvent, render } from "@testing-library/react-native";
import ComplaintsCard from "./ComplaintsCard";

/**
 * Customer complaints on Home (2026-10-23): for an assigner, how many are not
 * assigned yet; for a technician, their own open ones. One tap opens the list.
 */
const row = (id, name, status, extra = {}) => ({ _id: id, number: 1000, contactName: name, customerName: null, status, visitDate: null, ...extra });

test("an assigner sees how many are not assigned, newest names first", async () => {
  const onOpen = jest.fn();
  const screen = await render(
    <ComplaintsCard
      isAssigner
      complaints={[row("a", "Meena", "open"), row("b", "Ravi", "open"), row("c", "Anil", "assigned"), row("d", "Done", "resolved")]}
      isLoading={false}
      error={null}
      onOpen={onOpen}
    />
  );

  expect(screen.getByTestId("complaints-card-unassigned").props.children).toBe("2 not assigned");
  expect(screen.getByText("Meena")).toBeTruthy();
  expect(screen.queryByText("Done")).toBeNull();
  await fireEvent.press(screen.getByTestId("complaints-card"));
  expect(onOpen).toHaveBeenCalled();
});

test("a technician sees their open complaints, with a red pill once a visit date has passed", async () => {
  const screen = await render(
    <ComplaintsCard
      complaints={[row("a", "Late", "working", { visitDate: "2020-01-01" }), row("b", "Soon", "assigned", { visitDate: "2999-01-01" }), row("c", "Done", "resolved")]}
      isLoading={false}
      error={null}
      onOpen={() => {}}
    />
  );
  expect(screen.getByTestId("complaints-card-overdue").props.children).toBe("1 visit date passed");
  expect(screen.getByText("Late")).toBeTruthy();
  expect(screen.queryByText("Done")).toBeNull();
});

test("nothing open says so", async () => {
  const screen = await render(<ComplaintsCard complaints={[row("c", "Done", "resolved")]} isLoading={false} error={null} onOpen={() => {}} />);
  expect(screen.getByTestId("complaints-card-empty")).toBeTruthy();
});
