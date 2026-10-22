import { Linking } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import ComplaintDetailScreen from "./ComplaintDetailScreen";
import { getComplaint, setComplaintStatus } from "../api/complaintApi";
import { clearPermissionsCache } from "../../../hooks/useMyPermissions";
import useSessionStore from "../../../store/sessionStore";
import apiClient from "../../../api/apiClient";

jest.mock("../api/complaintApi", () => ({ getComplaint: jest.fn(), setComplaintStatus: jest.fn() }));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: jest.fn() }));

/**
 * A customer complaint in the app (2026-10-22): one-tap call, the
 * customer's words and photos, and the two steps — for the assignee only.
 */
const navigation = { goBack: jest.fn() };
const route = { params: { ticketId: "t1" } };

const COMPLAINT = {
  _id: "t1",
  number: 1004,
  status: "open",
  category: "technical",
  callbackTime: "evening",
  description: "Inverter shows a red light",
  customer: { _id: "c1", companyName: "Sharma Residence", phone: "+91 99990 10000", siteAddress: "DLF Phase 3", primaryContact: { name: "Rajesh Sharma", phone: "+91 98990 20000" } },
  assignedTo: { _id: "emp-1", name: "Ritu" },
  photoUrls: ["https://signed.test/p1"],
  createdAt: new Date(Date.now() - 3600000).toISOString(),
  history: [{ type: "comment", by: "Customer", comment: "Inverter shows a red light", createdAt: new Date().toISOString() }],
};

const ok = (data) => Promise.resolve({ data: { data } });

beforeEach(() => {
  jest.clearAllMocks();
  clearPermissionsCache();
  apiClient.defaults.adapter = async (config) => ({ status: 200, statusText: "200", headers: {}, config, data: { data: { role: "employee", permissions: { tickets: { view_assigned: true } } } } });
  useSessionStore.setState({ user: { _id: "emp-1", name: "Ritu", role: "employee" } });
});

test("shows who to call, when, what they said, and their photo; Call dials the contact", async () => {
  getComplaint.mockReturnValue(ok(COMPLAINT));
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  const screen = await render(<ComplaintDetailScreen navigation={navigation} route={route} />);

  await waitFor(() => expect(screen.getByText("Sharma Residence")).toBeTruthy());
  expect(screen.getByTestId("complaint-callback").props.children).toEqual(["Wants a call: ", "Evening (4 – 7)"]);
  expect(screen.getByTestId("complaint-description").props.children).toBe("Inverter shows a red light");
  expect(screen.getByTestId("complaint-photo-0")).toBeTruthy();

  await fireEvent.press(screen.getByTestId("complaint-call"));
  expect(openURL).toHaveBeenCalledWith("tel:+919899020000");
});

test("the assignee taps I'm on it; the record is re-read", async () => {
  getComplaint.mockReturnValueOnce(ok(COMPLAINT)).mockReturnValueOnce(ok({ ...COMPLAINT, status: "in_progress" }));
  setComplaintStatus.mockReturnValue(ok({}));
  const screen = await render(<ComplaintDetailScreen navigation={navigation} route={route} />);
  await waitFor(() => expect(screen.getByTestId("complaint-on-it")).toBeTruthy());

  await fireEvent.press(screen.getByTestId("complaint-on-it"));

  await waitFor(() => expect(setComplaintStatus).toHaveBeenCalledWith("t1", "in_progress", undefined));
  await waitFor(() => expect(screen.queryByTestId("complaint-on-it")).toBeNull());
  expect(screen.getByTestId("complaint-resolve")).toBeTruthy();
});

test("someone who is not the assignee sees the complaint but no buttons", async () => {
  useSessionStore.setState({ user: { _id: "emp-2", name: "Other", role: "employee" } });
  getComplaint.mockReturnValue(ok(COMPLAINT));
  const screen = await render(<ComplaintDetailScreen navigation={navigation} route={route} />);

  await waitFor(() => expect(screen.getByText("Sharma Residence")).toBeTruthy());
  expect(screen.queryByTestId("complaint-on-it")).toBeNull();
  expect(screen.queryByTestId("complaint-resolve")).toBeNull();
});

test("the server's refusal is shown in its own words", async () => {
  getComplaint.mockReturnValue(ok(COMPLAINT));
  const refusal = new Error("refused");
  refusal.response = { status: 403, data: { success: false, message: "You do not have permission to change this ticket's status" } };
  setComplaintStatus.mockRejectedValue(refusal);
  const screen = await render(<ComplaintDetailScreen navigation={navigation} route={route} />);
  await waitFor(() => expect(screen.getByTestId("complaint-on-it")).toBeTruthy());

  await fireEvent.press(screen.getByTestId("complaint-on-it"));

  await waitFor(() => expect(screen.getByText("You do not have permission to change this ticket's status")).toBeTruthy());
});
