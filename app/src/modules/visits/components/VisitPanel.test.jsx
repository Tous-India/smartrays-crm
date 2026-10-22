import { fireEvent, render, waitFor } from "@testing-library/react-native";
import VisitPanel from "./VisitPanel";
import { arriveAtVisit, completeVisit } from "../api/visitApi";
import { getFreshFix } from "../visits.utils";

jest.mock("../api/visitApi", () => ({ arriveAtVisit: jest.fn(), completeVisit: jest.fn() }));
jest.mock("../visits.utils", () => ({ ...jest.requireActual("../visits.utils"), getFreshFix: jest.fn() }));

/** The visit steps on the phone (2026-10-22): each press takes a fix; the server decides. */
const SITE = { lat: 28.4949, lng: 77.0937 };
const VISIT = { _id: "v1", status: "not_started", site: SITE, radiusMeters: 200, siteAddress: "DLF Phase 3", arrival: null, completion: null, photoCount: 0 };

function refusal(message) {
  const error = new Error(message);
  error.response = { status: 409, data: { success: false, message } };
  return error;
}

beforeEach(() => jest.clearAllMocks());

test("I've arrived sends a fresh fix and refreshes", async () => {
  getFreshFix.mockResolvedValue({ lat: 28.4951, lng: 77.0939, accuracy: 10 });
  arriveAtVisit.mockResolvedValue({});
  const onChanged = jest.fn(async () => {});
  const screen = await render(<VisitPanel visit={VISIT} canAct isOnline onChanged={onChanged} onTakePhoto={() => {}} />);

  await fireEvent.press(screen.getByTestId("visit-arrive"));

  await waitFor(() => expect(arriveAtVisit).toHaveBeenCalledWith("v1", { lat: 28.4951, lng: 77.0939, accuracy: 10 }));
  expect(onChanged).toHaveBeenCalled();
  expect(screen.getByTestId("visit-distance").props.children.join("")).toMatch(/^You are \d+ m from the site\.$/);
});

test("far from the site: the server's refusal and the distance are shown", async () => {
  getFreshFix.mockResolvedValue({ lat: 28.6315, lng: 77.2167, accuracy: 10 });
  arriveAtVisit.mockRejectedValue(refusal("You are 19.3 km from the site. You can tap Arrived only at the site."));
  const screen = await render(<VisitPanel visit={VISIT} canAct isOnline onChanged={jest.fn()} onTakePhoto={() => {}} />);

  await fireEvent.press(screen.getByTestId("visit-arrive"));

  await waitFor(() => expect(screen.getByText("You are 19.3 km from the site. You can tap Arrived only at the site.")).toBeTruthy());
  expect(screen.getByTestId("visit-distance").props.children.join("")).toMatch(/km from the site/);
});

test("after Arrived: take photos, then Mark visit done with the notes", async () => {
  getFreshFix.mockResolvedValue({ lat: 28.4951, lng: 77.0939, accuracy: 8 });
  completeVisit.mockResolvedValue({});
  const onTakePhoto = jest.fn();
  const arrived = { ...VISIT, status: "at_site", arrival: { at: new Date().toISOString() }, photoCount: 2 };
  const screen = await render(<VisitPanel visit={arrived} canAct isOnline onChanged={jest.fn(async () => {})} onTakePhoto={onTakePhoto} />);

  expect(screen.queryByTestId("visit-arrive")).toBeNull();
  await fireEvent.press(screen.getByTestId("visit-photo"));
  expect(onTakePhoto).toHaveBeenCalled();

  await fireEvent.changeText(screen.getByTestId("visit-notes"), "Meter photographed");
  await fireEvent.press(screen.getByTestId("visit-done"));
  await waitFor(() => expect(completeVisit).toHaveBeenCalledWith("v1", { coords: { lat: 28.4951, lng: 77.0939, accuracy: 8 }, notes: "Meter photographed" }));
});

test("someone else sees the visit but no buttons; offline the buttons are disabled", async () => {
  const other = await render(<VisitPanel visit={VISIT} canAct={false} isOnline onChanged={jest.fn()} onTakePhoto={() => {}} />);
  expect(other.queryByTestId("visit-arrive")).toBeNull();

  const offline = await render(<VisitPanel visit={VISIT} canAct isOnline={false} onChanged={jest.fn()} onTakePhoto={() => {}} />);
  expect(offline.getByTestId("visit-arrive").props.accessibilityState.disabled).toBe(true);
});
