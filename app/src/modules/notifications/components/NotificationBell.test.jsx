import { fireEvent, render } from "@testing-library/react-native";
import NotificationBell from "./NotificationBell";

test("shows the unread count (9+ past nine) and opens the list", async () => {
  const onPress = jest.fn();
  const screen = await render(<NotificationBell unread={3} onPress={onPress} />);
  expect(screen.getByTestId("notification-bell-count").props.children).toBe("3");
  expect(screen.getByTestId("notification-bell").props.accessibilityLabel).toBe("Notifications, 3 unread");
  await fireEvent.press(screen.getByTestId("notification-bell"));
  expect(onPress).toHaveBeenCalled();

  await screen.rerender(<NotificationBell unread={12} onPress={onPress} />);
  expect(screen.getByTestId("notification-bell-count").props.children).toBe("9+");
});

test("nothing unread → no badge", async () => {
  const screen = await render(<NotificationBell unread={0} onPress={jest.fn()} />);
  expect(screen.queryByTestId("notification-bell-count")).toBeNull();
});
