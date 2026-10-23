import { fireEvent, render, waitFor } from "@testing-library/react-native";
import NotificationsScreen from "./NotificationsScreen";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../api/notificationApi";

jest.mock("../api/notificationApi", () => ({
  listNotifications: jest.fn(),
  markNotificationRead: jest.fn(() => Promise.resolve({ data: { data: {} } })),
  markAllNotificationsRead: jest.fn(() => Promise.resolve({ data: { data: {} } })),
}));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: jest.fn() }));

/**
 * The in-app notifications list (2026-10-23): the same notifications the web
 * bell shows — so nothing depends on push reaching the phone. Unread first
 * in weight, a tap marks it read and opens what it is about.
 */
const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const ok = (data) => Promise.resolve({ data: { data } });

beforeEach(() => jest.clearAllMocks());

test("lists the server's notifications, unread marked; a tap marks it read and opens its screen", async () => {
  listNotifications.mockReturnValue(
    ok([
      { _id: "n1", type: "staff_location_alert", message: "Deepak Yadav: location off for 20 min", isRead: false, createdAt: new Date().toISOString(), relatedEntity: { module: "users", id: "u1" } },
      { _id: "n2", type: "leave_approved", message: "Your leave was approved", isRead: true, createdAt: new Date().toISOString(), relatedEntity: { module: "leave", id: "l1" } },
    ])
  );
  const screen = await render(<NotificationsScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByTestId("notification-n1")).toBeTruthy());
  expect(screen.getByTestId("notification-unread-n1")).toBeTruthy();
  expect(screen.queryByTestId("notification-unread-n2")).toBeNull();

  await fireEvent.press(screen.getByTestId("notification-n1"));
  expect(markNotificationRead).toHaveBeenCalledWith("n1");
  expect(navigation.navigate).toHaveBeenCalledWith("MainTabs", expect.objectContaining({ screen: "TeamTab", params: expect.objectContaining({ screen: "Team" }) }));
});

test("Mark all read, and the empty state", async () => {
  listNotifications.mockReturnValueOnce(ok([{ _id: "n1", type: "x", message: "One", isRead: false, createdAt: new Date().toISOString() }])).mockReturnValue(ok([]));
  const screen = await render(<NotificationsScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByTestId("notifications-mark-all")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("notifications-mark-all"));
  expect(markAllNotificationsRead).toHaveBeenCalled();
  await waitFor(() => expect(screen.getByText("No notifications yet.")).toBeTruthy());
});
