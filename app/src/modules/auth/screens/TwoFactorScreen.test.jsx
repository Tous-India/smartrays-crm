import { fireEvent, render, waitFor } from "@testing-library/react-native";
import TwoFactorScreen from "./TwoFactorScreen";
import { completeTwoFactor } from "../session.service";

jest.mock("../session.service", () => ({ completeTwoFactor: jest.fn() }));

const navigation = { goBack: jest.fn() };
const route = { params: { preAuthToken: "pre-auth", email: "employee@test.local" } };

function serverError(status, message) {
  const error = new Error(message);
  error.response = { status, data: { success: false, message } };
  return error;
}

beforeEach(() => {
  jest.clearAllMocks();
});

test("an empty code is caught before the request", async () => {
  const screen = await render(<TwoFactorScreen navigation={navigation} route={route} />);

  await fireEvent.press(screen.getByTestId("two-factor-submit"));

  expect(await screen.findByText("Enter the code from your authenticator app, or a recovery code")).toBeTruthy();
  expect(completeTwoFactor).not.toHaveBeenCalled();
});

test("verifies with the pre-auth token, the code and the remember flag", async () => {
  completeTwoFactor.mockResolvedValueOnce();
  const screen = await render(<TwoFactorScreen navigation={navigation} route={route} />);

  await fireEvent.changeText(screen.getByTestId("two-factor-code"), "123456");
  await fireEvent.press(screen.getByTestId("two-factor-remember"));
  await fireEvent.press(screen.getByTestId("two-factor-submit"));

  await waitFor(() => expect(completeTwoFactor).toHaveBeenCalledWith("pre-auth", "123456", true));
});

test("a wrong code and a lockout are shown in the server's words", async () => {
  completeTwoFactor.mockRejectedValueOnce(serverError(401, "That code isn't valid."));
  const screen = await render(<TwoFactorScreen navigation={navigation} route={route} />);

  await fireEvent.changeText(screen.getByTestId("two-factor-code"), "000000");
  await fireEvent.press(screen.getByTestId("two-factor-submit"));

  expect(await screen.findByText("That code isn't valid.")).toBeTruthy();

  completeTwoFactor.mockRejectedValueOnce(
    serverError(429, "Too many incorrect codes. Please sign in again from the start.")
  );
  await fireEvent.press(screen.getByTestId("two-factor-submit"));

  expect(await screen.findByText(/Too many incorrect codes/)).toBeTruthy();
});

test("Back to sign in returns to the login screen", async () => {
  const screen = await render(<TwoFactorScreen navigation={navigation} route={route} />);

  await fireEvent.press(screen.getByTestId("two-factor-back"));

  expect(navigation.goBack).toHaveBeenCalled();
});
