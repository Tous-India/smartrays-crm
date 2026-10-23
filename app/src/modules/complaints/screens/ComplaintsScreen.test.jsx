import { Linking, Share } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import ComplaintsScreen from "./ComplaintsScreen";
import { listComplaints } from "../api/complaintApi";
import { clearPermissionsCache } from "../../../hooks/useMyPermissions";
import apiClient from "../../../api/apiClient";

jest.mock("../api/complaintApi", () => ({ listComplaints: jest.fn() }));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: jest.fn() }));
jest.mock("react-native-config", () => ({ WEB_APP_URL: "https://crm.example.test", API_BASE_URL: "https://api.example.test/api/v1" }));

/**
 * Complaints in the app (2026-10-23): assigners (admin or complaints.assign)
 * see every complaint, unassigned on top, with filters and the share link;
 * everyone else sees "My complaints".
 */
const navigation = { goBack: jest.fn(), navigate: jest.fn() };
const HOUR = 3600000;
const ago = (hours) => new Date(Date.now() - hours * HOUR).toISOString();

const ROWS = [
  { _id: "a", number: 1006, status: "open", priority: null, contactName: "Meena Joshi", contactPhone: "98765 43210", customerName: null, description: "Panels dusty", assigneeName: null, visitDate: null, createdAt: ago(2) },
  { _id: "b", number: 1005, status: "assigned", priority: "urgent", contactName: "Ramesh", contactPhone: "98100 12345", customerName: "Sharma Residence", description: "Inverter red light", assigneeName: "Suresh Kumar", visitDate: "2026-10-25", createdAt: ago(5) },
  { _id: "c", number: 1001, status: "resolved", priority: "low", contactName: "Anil", contactPhone: "99999 88888", customerName: null, description: "Meter", assigneeName: "Suresh Kumar", visitDate: "2026-10-20", createdAt: ago(80) },
];

function signedInAs(role, permissions = {}) {
  clearPermissionsCache();
  apiClient.defaults.adapter = async (config) => ({ status: 200, statusText: "200", headers: {}, config, data: { data: { role, permissions } } });
}

beforeEach(() => {
  jest.clearAllMocks();
  listComplaints.mockResolvedValue({ data: { data: ROWS } });
});

test("an admin sees every complaint — unassigned first — and can filter", async () => {
  signedInAs("admin");
  const screen = await render(<ComplaintsScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByText("Complaints")).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId("complaint-row-a")).toBeTruthy());
  expect(screen.getByTestId("complaint-row-b")).toBeTruthy();
  expect(screen.getByTestId("complaint-unassigned-a")).toBeTruthy();
  expect(screen.getByText("Urgent")).toBeTruthy();

  await fireEvent.press(screen.getByTestId("complaint-filter-unassigned"));
  expect(screen.getByTestId("complaint-row-a")).toBeTruthy();
  expect(screen.queryByTestId("complaint-row-b")).toBeNull();

  await fireEvent.press(screen.getByTestId("complaint-filter-resolved"));
  expect(screen.getByTestId("complaint-row-c")).toBeTruthy();
  expect(screen.queryByTestId("complaint-row-a")).toBeNull();

  await fireEvent.press(screen.getByTestId("complaint-filter-all"));
  await fireEvent.press(screen.getByTestId("complaint-row-b"));
  expect(navigation.navigate).toHaveBeenCalledWith("ComplaintDetail", { ticketId: "b" });
});

test("assigners can share the one complaint link on WhatsApp, by SMS, or through the share sheet", async () => {
  signedInAs("employee", { complaints: { view_all: true, assign: true } });
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
  const screen = await render(<ComplaintsScreen navigation={navigation} />);
  await waitFor(() => expect(screen.getByTestId("share-whatsapp")).toBeTruthy());

  const text = "For any issue with your solar system, tell us here: https://crm.example.test/complaint";
  await fireEvent.press(screen.getByTestId("share-whatsapp"));
  expect(openURL).toHaveBeenCalledWith(`https://wa.me/?text=${encodeURIComponent(text)}`);
  await fireEvent.press(screen.getByTestId("share-sms"));
  expect(openURL).toHaveBeenCalledWith(`sms:?body=${encodeURIComponent(text)}`);
  await fireEvent.press(screen.getByTestId("share-more"));
  expect(share).toHaveBeenCalledWith({ message: text });
});

test("a technician sees 'My complaints', active first, without filters or sharing", async () => {
  signedInAs("employee", {});
  listComplaints.mockResolvedValue({ data: { data: ROWS.slice(1) } });
  const screen = await render(<ComplaintsScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByText("My complaints")).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId("complaint-row-b")).toBeTruthy());
  expect(screen.queryByTestId("complaint-filter-unassigned")).toBeNull();
  expect(screen.queryByTestId("share-whatsapp")).toBeNull();
  // The resolved one is still listed, under the active ones.
  expect(screen.getByTestId("complaint-row-c")).toBeTruthy();
});
