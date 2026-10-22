import { render, waitFor } from "@testing-library/react-native";
import ServiceDetailScreen from "./ServiceDetailScreen";
import { getService } from "../api/serviceApi";
import { getUserDirectory } from "../../../api/userApi";
import { findVisitForService } from "../../visits/api/visitApi";
import { clearUserDirectoryCache } from "../../../hooks/useUserDirectory";
import { clearPermissionsCache } from "../../../hooks/useMyPermissions";
import apiClient from "../../../api/apiClient";

jest.mock("../api/serviceApi", () => ({ getService: jest.fn(), setServiceStatus: jest.fn(), setSubtaskDone: jest.fn() }));
jest.mock("../../../api/userApi", () => ({ getUserDirectory: jest.fn() }));
jest.mock("../../visits/api/visitApi", () => ({ findVisitForService: jest.fn() }));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: jest.fn() }));

/** Verified site visits (2026-10-22): a visit's Service is finished by the visit's Done, at the site. */
const ok = (data) => Promise.resolve({ data: { data } });
const SERVICE = { _id: "s1", title: "Site visit — Verma Villa (Inspection)", description: "", status: "todo", dueDate: null, createdById: "mgr-1", assignedToId: "emp-1", subtasks: [] };

beforeEach(() => {
  jest.clearAllMocks();
  clearUserDirectoryCache();
  clearPermissionsCache();
  apiClient.defaults.adapter = async (config) => ({ status: 200, statusText: "200", headers: {}, config, data: { data: { role: "employee", permissions: { services: { view: true } } } } });
  getUserDirectory.mockReturnValue(ok([{ _id: "mgr-1", name: "Testing Manager", role: "manager" }]));
});

test("a service with a site visit shows the visit steps instead of Mark complete", async () => {
  getService.mockReturnValue(ok(SERVICE));
  findVisitForService.mockResolvedValue({ _id: "v1", status: "not_started", site: { lat: 28.49, lng: 77.09 }, radiusMeters: 200, arrival: null, completion: null, photoCount: 0 });
  const screen = await render(<ServiceDetailScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { serviceId: "s1" } }} />);

  await waitFor(() => expect(screen.getByTestId("visit-panel")).toBeTruthy());
  expect(screen.queryByTestId("service-mark-complete")).toBeNull();
});

test("an ordinary service keeps Mark complete", async () => {
  getService.mockReturnValue(ok({ ...SERVICE, title: "Call the vendor" }));
  findVisitForService.mockResolvedValue(null);
  const screen = await render(<ServiceDetailScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { serviceId: "s1" } }} />);

  await waitFor(() => expect(screen.getByTestId("service-mark-complete")).toBeTruthy());
  expect(screen.queryByTestId("visit-panel")).toBeNull();
});
