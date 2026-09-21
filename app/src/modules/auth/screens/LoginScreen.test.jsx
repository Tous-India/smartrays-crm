import { fireEvent, render, waitFor } from "@testing-library/react-native";
import LoginScreen from "./LoginScreen";
import { signIn } from "../session.service";

jest.mock("../session.service", () => ({ signIn: jest.fn() }));

/**
 * The screen's own contract: validate before calling anything, one request
 * per tap, the server's message on screen, and the 2FA hand-off. What the
 * session service does with a login is its own test.
 */

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function serverError(status, message) {
  const error = new Error(message);
  error.response = { status, data: { success: false, message } };
  return error;
}

const navigation = { navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
});

test("empty submit shows both field messages and never calls the server", async () => {
  const screen = await render(<LoginScreen navigation={navigation} />);

  await fireEvent.press(screen.getByTestId("login-submit"));

  expect(await screen.findByText("Email is required")).toBeTruthy();
  expect(screen.getByText("Password is required")).toBeTruthy();
  expect(signIn).not.toHaveBeenCalled();
});

test("a malformed email is caught before the request", async () => {
  const screen = await render(<LoginScreen navigation={navigation} />);

  await fireEvent.changeText(screen.getByTestId("login-email"), "not-an-email");
  await fireEvent.changeText(screen.getByTestId("login-password"), "secret");
  await fireEvent.press(screen.getByTestId("login-submit"));

  expect(await screen.findByText("Enter a valid email address")).toBeTruthy();
  expect(signIn).not.toHaveBeenCalled();
});

test("the backend's own message is shown, not swallowed", async () => {
  signIn.mockRejectedValueOnce(serverError(401, "Invalid email or password"));
  const screen = await render(<LoginScreen navigation={navigation} />);

  await fireEvent.changeText(screen.getByTestId("login-email"), "employee@test.local");
  await fireEvent.changeText(screen.getByTestId("login-password"), "wrong");
  await fireEvent.press(screen.getByTestId("login-submit"));

  expect(await screen.findByText("Invalid email or password")).toBeTruthy();
  expect(signIn).toHaveBeenCalledWith("employee@test.local", "wrong");
});

test("a network failure reads as a connection problem", async () => {
  const error = new Error("Network Error");
  error.request = {};
  signIn.mockRejectedValueOnce(error);
  const screen = await render(<LoginScreen navigation={navigation} />);

  await fireEvent.changeText(screen.getByTestId("login-email"), "employee@test.local");
  await fireEvent.changeText(screen.getByTestId("login-password"), "secret");
  await fireEvent.press(screen.getByTestId("login-submit"));

  expect(await screen.findByText(/Could not reach the server/)).toBeTruthy();
});

test("a second tap while the first request is in flight does nothing", async () => {
  const pending = deferred();
  signIn.mockReturnValueOnce(pending.promise);
  const screen = await render(<LoginScreen navigation={navigation} />);

  await fireEvent.changeText(screen.getByTestId("login-email"), "employee@test.local");
  await fireEvent.changeText(screen.getByTestId("login-password"), "secret");
  // RNTL awaits the handler's promise, and this one stays pending on purpose.
  const firstPress = fireEvent.press(screen.getByTestId("login-submit"));
  await waitFor(() => expect(screen.getByTestId("login-submit").props.accessibilityState.busy).toBe(true));

  await fireEvent.press(screen.getByTestId("login-submit"));
  await fireEvent(screen.getByTestId("login-password"), "submitEditing");

  expect(signIn).toHaveBeenCalledTimes(1);

  pending.resolve({ requiresTwoFactor: false });
  await firstPress;
  await waitFor(() => expect(screen.getByTestId("login-submit").props.accessibilityState.busy).toBe(false));
});

test("a two-factor challenge moves to the code step with the pre-auth token", async () => {
  signIn.mockResolvedValueOnce({ requiresTwoFactor: true, preAuthToken: "pre-auth", email: "employee@test.local" });
  const screen = await render(<LoginScreen navigation={navigation} />);

  await fireEvent.changeText(screen.getByTestId("login-email"), "employee@test.local");
  await fireEvent.changeText(screen.getByTestId("login-password"), "secret");
  await fireEvent.press(screen.getByTestId("login-submit"));

  await waitFor(() =>
    expect(navigation.navigate).toHaveBeenCalledWith("TwoFactor", { preAuthToken: "pre-auth", email: "employee@test.local" })
  );
});
