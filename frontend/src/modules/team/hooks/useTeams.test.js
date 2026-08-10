import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import useTeams from "./useTeams";
import { listTeams } from "../api/teamApi";

/**
 * `useTeams` error handling (2026-08-09).
 *
 * It had `try { … } finally { … }` and NO catch, so a 403 from `GET /teams` —
 * which every non-manager gets, and which an employee hit on their own /leave
 * page through LeaveSection — became an unhandled promise rejection in the
 * console instead of being handled anywhere.
 */

vi.mock("../api/teamApi", () => ({ listTeams: vi.fn() }));

let unhandled;

beforeEach(() => {
  vi.clearAllMocks();
  unhandled = [];
  process.on?.("unhandledRejection", (reason) => unhandled.push(reason));
});

afterEach(() => {
  process.removeAllListeners?.("unhandledRejection");
});

describe("a 403 is handled, never thrown", () => {
  it("degrades to an empty list instead of rejecting", async () => {
    const forbidden = Object.assign(new Error("Forbidden"), {
      response: { status: 403, data: { message: "You do not have permission" } },
    });
    listTeams.mockRejectedValue(forbidden);

    const { result } = renderHook(() => useTeams());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Teams are only ever a filter option or a label here — losing them costs
    // a dropdown entry, whereas throwing costs a clean console.
    expect(result.current.teams).toEqual([]);
  });

  it("still resolves loading to false after a failure", async () => {
    listTeams.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useTeams());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
});

describe("enabled: false — do not ask at all", () => {
  it("makes NO request when disabled", async () => {
    listTeams.mockResolvedValue({ data: { data: [] } });

    const { result } = renderHook(() => useTeams(undefined, { enabled: false }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Better than asking and swallowing a 403 the caller already knew about:
    // an employee has no teams.* grant, so the request is pure noise.
    expect(listTeams).not.toHaveBeenCalled();
    expect(result.current.teams).toEqual([]);
  });

  it("DOES request when enabled", async () => {
    listTeams.mockResolvedValue({ data: { data: [{ _id: "t1", name: "Field" }] } });

    const { result } = renderHook(() => useTeams(undefined, { enabled: true }));

    await waitFor(() => expect(result.current.teams).toHaveLength(1));
    expect(listTeams).toHaveBeenCalled();
  });
});
