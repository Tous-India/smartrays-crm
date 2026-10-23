import { fireEvent, render, waitFor } from "@testing-library/react-native";
import AssignComplaintScreen from "./AssignComplaintScreen";
import { assignComplaint, getComplaint, listComplaintAssignees } from "../api/complaintApi";

jest.mock("../api/complaintApi", () => ({ assignComplaint: jest.fn(), getComplaint: jest.fn(), listComplaintAssignees: jest.fn() }));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: jest.fn() }));

/** Assigning in the app (2026-10-23): who, how urgent, which day — big taps, no typing. */
const navigation = { goBack: jest.fn() };
const route = { params: { ticketId: "t1" } };
const ok = (data) => Promise.resolve({ data: { data } });

const tomorrowKey = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

beforeEach(() => {
  jest.clearAllMocks();
  getComplaint.mockReturnValue(ok({ _id: "t1", number: 1004, contactName: "Ramesh Sharma", assignedTo: null, priority: null, visitDate: null }));
  listComplaintAssignees.mockReturnValue(ok([{ _id: "tech-1", name: "Suresh Kumar", role: "employee" }, { _id: "tech-2", name: "Ravi Verma", role: "employee" }]));
});

test("pick a person, a priority and Tomorrow, then Assign", async () => {
  assignComplaint.mockReturnValue(ok({}));
  const screen = await render(<AssignComplaintScreen navigation={navigation} route={route} />);
  await waitFor(() => expect(screen.getByTestId("assignee-tech-1")).toBeTruthy());

  await fireEvent.press(screen.getByTestId("assignee-tech-1"));
  await fireEvent.press(screen.getByTestId("priority-high"));
  await fireEvent.press(screen.getByTestId("visit-tomorrow"));
  await fireEvent.press(screen.getByTestId("assign-save"));

  await waitFor(() => expect(assignComplaint).toHaveBeenCalledWith("t1", { assignedToId: "tech-1", priority: "high", visitDate: tomorrowKey() }));
  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
});

test("says what is missing before sending", async () => {
  const screen = await render(<AssignComplaintScreen navigation={navigation} route={route} />);
  await waitFor(() => expect(screen.getByTestId("assign-save")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("assign-save"));
  expect(screen.getByText("Choose who should go.")).toBeTruthy();
  expect(assignComplaint).not.toHaveBeenCalled();
});
