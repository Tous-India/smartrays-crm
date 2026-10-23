import Config from "react-native-config";
import { fireEvent, render } from "@testing-library/react-native";
import TeamMap from "./TeamMap";

/**
 * The team map is Google Maps (react-native-maps, Google provider), keyed
 * from the untracked env file (2026-10-23). Without a key it says so
 * instead of drawing a blank or broken map.
 */
const markers = [
  { id: "a", name: "Deepak", coords: { lat: 28.49, lng: 77.08 }, color: "#f08c00", stale: false },
  { id: "b", name: "Manoj", coords: { lat: 28.47, lng: 77.5 }, color: "#343a40", stale: true },
];

afterEach(() => {
  Config.GOOGLE_MAPS_API_KEY = "test-maps-key";
});

test("with a key: a Google map, one marker per person in their status colour; a tap selects", async () => {
  const onSelect = jest.fn();
  const screen = await render(<TeamMap markers={markers} selectedId={null} onSelect={onSelect} />);

  expect(screen.getByTestId("mock-map-view").props.provider).toBe("google");
  expect(screen.getAllByTestId("mock-map-marker")).toHaveLength(2);
  expect(screen.getByTestId("team-map-dot-a").props.style).toEqual(expect.arrayContaining([{ backgroundColor: "#f08c00" }]));
  expect(screen.getByTestId("team-map-marker-b").props.accessibilityLabel).toBe("Manoj, stale");

  await fireEvent.press(screen.getByTestId("team-map-marker-a"));
  expect(onSelect).toHaveBeenCalledWith(markers[0]);
});

test("no key → 'Map not configured', and no map is loaded at all", async () => {
  Config.GOOGLE_MAPS_API_KEY = "";
  const screen = await render(<TeamMap markers={markers} selectedId={null} onSelect={jest.fn()} />);

  expect(screen.getByText("Map not configured")).toBeTruthy();
  expect(screen.queryByTestId("mock-map-view")).toBeNull();
});
