import { fireEvent, render, waitFor } from "@testing-library/react-native";
import TeamLeaveSection from "./TeamLeaveSection";
import { approveLeave, declineLeave } from "../api/teamApi";

jest.mock("../api/teamApi", () => ({ approveLeave: jest.fn(), declineLeave: jest.fn() }));

/**
 * Leave decisions in the app (2026-10-23, owner's brief: "leave apply /
 * approve"): a manager approves or declines a pending request right from the
 * Team tab — the same server rules as the web.
 */
const LEAVES = [
  { _id: "l1", employeeId: "e1", status: "pending", type: "paid", startDate: "2026-10-26", endDate: "2026-10-26", reason: "Family function" },
  { _id: "l2", employeeId: "e2", status: "approved", type: "unpaid", startDate: "2026-10-20", endDate: "2026-10-20" },
];
const leaves = { data: LEAVES, isLoading: false, error: null, refetch: jest.fn(() => Promise.resolve()) };
const nameById = new Map([["e1", "Deepak Yadav"], ["e2", "Ritu Chauhan"]]);
const ok = () => Promise.resolve({ data: { data: {} } });

beforeEach(() => jest.clearAllMocks());

test("approve a pending request; decided ones have no buttons", async () => {
  approveLeave.mockImplementation(ok);
  const screen = await render(<TeamLeaveSection leaves={leaves} nameById={nameById} canApprove canDecline isOnline />);

  expect(screen.queryByTestId("team-leave-approve-l2")).toBeNull();
  await fireEvent.press(screen.getByTestId("team-leave-approve-l1"));
  await waitFor(() => expect(approveLeave).toHaveBeenCalledWith("l1"));
  expect(leaves.refetch).toHaveBeenCalled();
});

test("decline with an optional reason", async () => {
  declineLeave.mockImplementation(ok);
  const screen = await render(<TeamLeaveSection leaves={leaves} nameById={nameById} canApprove canDecline isOnline />);

  await fireEvent.press(screen.getByTestId("team-leave-decline-l1"));
  await fireEvent.changeText(screen.getByTestId("team-leave-decline-reason-l1"), "Team is short that day");
  await fireEvent.press(screen.getByTestId("team-leave-decline-confirm-l1"));
  await waitFor(() => expect(declineLeave).toHaveBeenCalledWith("l1", "Team is short that day"));
});

test("without the permissions, the list stays view only", async () => {
  const screen = await render(<TeamLeaveSection leaves={leaves} nameById={nameById} isOnline />);
  expect(screen.queryByTestId("team-leave-approve-l1")).toBeNull();
  expect(screen.queryByTestId("team-leave-decline-l1")).toBeNull();
});
