import NetInfo from "@react-native-community/netinfo";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";
import Screen from "./Screen";

/**
 * Every screen says when the phone is offline (2026-10-23) — one banner in
 * the shared frame instead of each screen deciding on its own.
 */
test("offline → a banner on top of any screen; online → none", async () => {
  NetInfo.addEventListener.mockImplementationOnce((listener) => {
    listener({ isConnected: false, isInternetReachable: false });
    return () => {};
  });
  const offline = await render(
    <Screen>
      <Text>Body</Text>
    </Screen>
  );
  expect(offline.getByTestId("offline-banner")).toBeTruthy();
  expect(offline.getByText(/No internet/)).toBeTruthy();

  const online = await render(
    <Screen>
      <Text>Body</Text>
    </Screen>
  );
  expect(online.queryByTestId("offline-banner")).toBeNull();
});
