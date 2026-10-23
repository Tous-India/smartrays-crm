import { Linking } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import ComplaintDetailScreen from "./ComplaintDetailScreen";
import { getComplaint, changeComplaintStatus, sendComplaintBack, linkComplaintCustomer, saveComplaintContact } from "../api/complaintApi";
import useSessionStore from "../../../store/sessionStore";

jest.mock("../api/complaintApi", () => ({
  getComplaint: jest.fn(),
  changeComplaintStatus: jest.fn(),
  sendComplaintBack: jest.fn(),
  linkComplaintCustomer: jest.fn(),
  saveComplaintContact: jest.fn(),
}));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: jest.fn() }));

/**
 * One complaint in the app (2026-10-23): who to call (one tap), Google Maps,
 * what the customer said, the matched customer; for assigners Assign; for the
 * technician the next steps, a note, a live photo and Send back with a reason.
 */
const navigation = { goBack: jest.fn(), navigate: jest.fn() };
const route = { params: { ticketId: "t1" } };

const BASE = {
  _id: "t1",
  number: 1004,
  status: "assigned",
  priority: "high",
  visitDate: "2026-10-25",
  contactName: "Ramesh Sharma",
  contactPhone: "98100 12345",
  address: "B-12, Sector 7, Dwarka",
  location: { lat: 28.5921, lng: 77.046 },
  description: "Inverter shows a red light",
  callbackTime: "evening",
  matchedCustomer: { _id: "cust-1", companyName: "Sharma Residence", commissioningDate: "2025-03-14T00:00:00.000Z" },
  assignedTo: { _id: "tech-1", name: "Suresh Kumar" },
  assignedBy: { _id: "admin-1", name: "Vinay Gupta" },
  customerPhotos: [{ url: "https://signed.test/p1" }],
  staffPhotos: [],
  history: [{ type: "comment", by: "Customer", comment: "Inverter shows a red light", createdAt: new Date().toISOString() }],
  createdAt: new Date(Date.now() - 3600000).toISOString(),
  canAssign: false,
  canWork: true,
};

const ok = (data) => Promise.resolve({ data: { data } });

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ user: { _id: "tech-1", name: "Suresh Kumar", role: "employee" } });
});

test("shows the customer, the match, who assigned it; Call dials and Maps opens the pin", async () => {
  getComplaint.mockReturnValue(ok(BASE));
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  const screen = await render(<ComplaintDetailScreen navigation={navigation} route={route} />);

  await waitFor(() => expect(screen.getByText("Ramesh Sharma")).toBeTruthy());
  expect(screen.getByTestId("complaint-match").props.children).toBe("Existing customer: Sharma Residence, installed 14 Mar 2025");
  expect(screen.getByTestId("complaint-description").props.children).toBe("Inverter shows a red light");
  expect(screen.getByText(/Assigned by Vinay Gupta/)).toBeTruthy();
  expect(screen.getByText("High")).toBeTruthy();

  await fireEvent.press(screen.getByTestId("complaint-call"));
  expect(openURL).toHaveBeenCalledWith("tel:9810012345");
  await fireEvent.press(screen.getByTestId("complaint-maps"));
  expect(openURL).toHaveBeenCalledWith("https://www.google.com/maps/search/?api=1&query=28.5921,77.046");
});

test("the technician moves it forward; the record is re-read", async () => {
  getComplaint.mockReturnValueOnce(ok(BASE)).mockReturnValueOnce(ok({ ...BASE, status: "on_the_way" }));
  changeComplaintStatus.mockReturnValue(ok({}));
  const screen = await render(<ComplaintDetailScreen navigation={navigation} route={route} />);
  await waitFor(() => expect(screen.getByTestId("complaint-step-on_the_way")).toBeTruthy());

  await fireEvent.press(screen.getByTestId("complaint-step-on_the_way"));
  await waitFor(() => expect(changeComplaintStatus).toHaveBeenCalledWith("t1", "on_the_way", undefined));
  await waitFor(() => expect(screen.queryByTestId("complaint-step-on_the_way")).toBeNull());
  expect(screen.getByTestId("complaint-step-working")).toBeTruthy();
});

test("resolving sends the note", async () => {
  getComplaint.mockReturnValue(ok({ ...BASE, status: "working" }));
  changeComplaintStatus.mockReturnValue(ok({}));
  const screen = await render(<ComplaintDetailScreen navigation={navigation} route={route} />);
  await waitFor(() => expect(screen.getByTestId("complaint-note")).toBeTruthy());

  await fireEvent.changeText(screen.getByTestId("complaint-note"), "Replaced the fuse.");
  await fireEvent.press(screen.getByTestId("complaint-step-resolved"));
  await waitFor(() => expect(changeComplaintStatus).toHaveBeenCalledWith("t1", "resolved", "Replaced the fuse."));
});

test("Add photo opens the live camera for this complaint", async () => {
  getComplaint.mockReturnValue(ok(BASE));
  const screen = await render(<ComplaintDetailScreen navigation={navigation} route={route} />);
  await waitFor(() => expect(screen.getByTestId("complaint-photo")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("complaint-photo"));
  expect(navigation.navigate).toHaveBeenCalledWith("ComplaintPhoto", { ticketId: "t1" });
});

test("Send back needs a reason, then returns to the list", async () => {
  getComplaint.mockReturnValue(ok(BASE));
  sendComplaintBack.mockReturnValue(ok({ status: "open" }));
  const screen = await render(<ComplaintDetailScreen navigation={navigation} route={route} />);
  await waitFor(() => expect(screen.getByTestId("complaint-send-back")).toBeTruthy());

  await fireEvent.press(screen.getByTestId("complaint-send-back"));
  await fireEvent.press(screen.getByTestId("complaint-send-back-confirm"));
  expect(sendComplaintBack).not.toHaveBeenCalled();
  expect(screen.getByText("Please say why you are sending it back.")).toBeTruthy();

  await fireEvent.changeText(screen.getByTestId("complaint-send-back-reason"), "Billing question, not technical.");
  await fireEvent.press(screen.getByTestId("complaint-send-back-confirm"));
  await waitFor(() => expect(sendComplaintBack).toHaveBeenCalledWith("t1", "Billing question, not technical."));
  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
});

test("an assigner sees Assign / Reassign; a non-assignee sees no work buttons", async () => {
  useSessionStore.setState({ user: { _id: "admin-1", name: "Vinay Gupta", role: "admin" } });
  getComplaint.mockReturnValue(ok({ ...BASE, status: "open", assignedTo: null, assignedBy: null, canAssign: true, canWork: true }));
  const screen = await render(<ComplaintDetailScreen navigation={navigation} route={route} />);
  await waitFor(() => expect(screen.getByTestId("complaint-assign")).toBeTruthy());
  expect(screen.getByText("Not assigned yet")).toBeTruthy();
  expect(screen.queryByTestId("complaint-send-back")).toBeNull();

  await fireEvent.press(screen.getByTestId("complaint-assign"));
  expect(navigation.navigate).toHaveBeenCalledWith("AssignComplaint", { ticketId: "t1" });
});

// 2026-10-23: a caller the phone did not match — what they typed; an assigner links and saves the number.
test("an unknown caller: the typed name, 'Did you mean', Link, then Save as contact", async () => {
  useSessionStore.setState({ user: { _id: "admin-1", name: "Vinay Gupta", role: "admin" } });
  const unmatched = { ...BASE, matchedCustomer: null, companyName: "Gupta Industry", suggestedCustomers: [{ _id: "cust-9", companyName: "Gupta Industries" }], canAssign: true, canSaveContact: false };
  const linked = { ...unmatched, matchedCustomer: { _id: "cust-9", companyName: "Gupta Industries" }, suggestedCustomers: [], canSaveContact: true };
  getComplaint.mockReturnValueOnce(ok(unmatched)).mockReturnValueOnce(ok(linked)).mockReturnValue(ok({ ...linked, canSaveContact: false }));
  linkComplaintCustomer.mockReturnValue(ok(linked));
  saveComplaintContact.mockReturnValue(ok({ ...linked, canSaveContact: false }));
  const screen = await render(<ComplaintDetailScreen navigation={navigation} route={route} />);

  await waitFor(() => expect(screen.getByText("They typed: Gupta Industry")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("complaint-link-cust-9"));
  await waitFor(() => expect(linkComplaintCustomer).toHaveBeenCalledWith("t1", "cust-9"));
  await waitFor(() => expect(screen.getByTestId("complaint-save-contact")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("complaint-save-contact"));
  await waitFor(() => expect(saveComplaintContact).toHaveBeenCalledWith("t1"));
  await waitFor(() => expect(screen.queryByTestId("complaint-save-contact")).toBeNull());
});
