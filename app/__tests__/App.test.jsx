import { render } from "@testing-library/react-native";
import App from "../App";

/**
 * A cold start with nothing in the keychain: the restore finds no tokens and
 * the auth stack renders. This is the one place the whole tree is mounted.
 * (RNTL 14's `render` is async — it settles the initial effects itself.)
 */
test("boots to the sign-in screen when no session is stored", async () => {
  const screen = await render(<App />);

  expect(await screen.findByTestId("login-screen")).toBeTruthy();
});
