import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../tests/helpers/testDb.js";

let Attendance, createUserDirectly, registerAttendancePhotoCleanupCron, runAttendancePhotoCleanupJob;
let deleteCloudinaryAssetMock;

// Dynamic imports deferred until after startTestDatabase() has set every env
// var env.js requires at boot — same reasoning as payrollCron.test.js.
beforeAll(async () => {
  await startTestDatabase();

  vi.doMock("../services/cloudinary.service.js", () => ({
    uploadAttendancePhoto: vi.fn(),
    deleteCloudinaryAsset: vi.fn(async () => ({ result: "ok" })),
  }));

  ({ default: Attendance } = await import("../modules/attendance/attendance.model.js"));
  ({ createUserDirectly } = await import("../../tests/helpers/authHelpers.js"));
  ({ registerAttendancePhotoCleanupCron, runAttendancePhotoCleanupJob } = await import(
    "./attendancePhotoCleanupCron.js"
  ));
  ({ deleteCloudinaryAsset: deleteCloudinaryAssetMock } = await import(
    "../services/cloudinary.service.js"
  ));
});

afterEach(async () => {
  await Attendance.deleteMany({});
  deleteCloudinaryAssetMock.mockClear();
  deleteCloudinaryAssetMock.mockImplementation(async () => ({ result: "ok" }));
});

afterAll(async () => {
  await stopTestDatabase();
});

function daysAgo(n) {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date;
}

describe("registerAttendancePhotoCleanupCron", () => {
  it("schedules the daily job at 00:15", async () => {
    const cron = await import("node-cron");
    const scheduleSpy = vi.spyOn(cron.default, "schedule").mockImplementation(() => {});

    registerAttendancePhotoCleanupCron();

    expect(scheduleSpy).toHaveBeenCalledWith("15 0 * * *", expect.any(Function));

    scheduleSpy.mockRestore();
  });
});

describe("runAttendancePhotoCleanupJob", () => {
  it("deletes the Cloudinary asset and clears photoUrl/photoPublicId for a record older than 45 days", async () => {
    const employee = await createUserDirectly({
      name: "Old Record Employee",
      email: "oldrecord@test.local",
      password: "Password123",
      role: "employee",
    });

    const oldRecord = await Attendance.create({
      employeeId: employee._id,
      date: daysAgo(50),
      checkIn: { time: daysAgo(50), photoUrl: "https://fake.cloudinary.test/old-in.jpg", photoPublicId: "old-in-id" },
      // +8h rather than reusing the check-in instant: the model rejects a
      // check-out at or before its check-in (2026-08-08). This test asserts on
      // photos, never on the times.
      checkOut: {
        time: new Date(daysAgo(50).getTime() + 8 * 60 * 60 * 1000),
        photoUrl: "https://fake.cloudinary.test/old-out.jpg",
        photoPublicId: "old-out-id",
      },
    });

    const result = await runAttendancePhotoCleanupJob(new Date());

    expect(result.checked).toBe(1);
    expect(result.cleaned).toBe(1);
    expect(result.failed).toBe(0);
    expect(deleteCloudinaryAssetMock).toHaveBeenCalledWith("old-in-id");
    expect(deleteCloudinaryAssetMock).toHaveBeenCalledWith("old-out-id");

    const refreshed = await Attendance.findById(oldRecord._id).select(
      "+checkIn.photoPublicId +checkOut.photoPublicId"
    );
    expect(refreshed.checkIn.photoUrl).toBeNull();
    expect(refreshed.checkIn.photoPublicId).toBeNull();
    expect(refreshed.checkOut.photoUrl).toBeNull();
    expect(refreshed.checkOut.photoPublicId).toBeNull();
  });

  it("leaves a record newer than 45 days completely untouched", async () => {
    const employee = await createUserDirectly({
      name: "Recent Record Employee",
      email: "recentrecord@test.local",
      password: "Password123",
      role: "employee",
    });

    const recentRecord = await Attendance.create({
      employeeId: employee._id,
      date: daysAgo(10),
      checkIn: { time: daysAgo(10), photoUrl: "https://fake.cloudinary.test/recent-in.jpg", photoPublicId: "recent-in-id" },
    });

    const result = await runAttendancePhotoCleanupJob(new Date());

    expect(result.checked).toBe(0);
    expect(deleteCloudinaryAssetMock).not.toHaveBeenCalled();

    const refreshed = await Attendance.findById(recentRecord._id).select("+checkIn.photoPublicId");
    expect(refreshed.checkIn.photoUrl).toBe("https://fake.cloudinary.test/recent-in.jpg");
    expect(refreshed.checkIn.photoPublicId).toBe("recent-in-id");
  });

  it("never touches any other field on the cleaned record", async () => {
    const employee = await createUserDirectly({
      name: "Untouched Fields Employee",
      email: "untouchedfields@test.local",
      password: "Password123",
      role: "employee",
    });

    const record = await Attendance.create({
      employeeId: employee._id,
      date: daysAgo(60),
      status: "present",
      checkIn: {
        time: daysAgo(60),
        coords: { lat: 12.9, lng: 77.5 },
        photoUrl: "https://fake.cloudinary.test/keep-coords-in.jpg",
        photoPublicId: "keep-coords-in-id",
      },
      workingHours: 8.5,
    });

    await runAttendancePhotoCleanupJob(new Date());

    const refreshed = await Attendance.findById(record._id);
    expect(refreshed.status).toBe("present");
    expect(refreshed.workingHours).toBe(8.5);
    expect(refreshed.checkIn.coords.lat).toBe(12.9);
    expect(refreshed.checkIn.coords.lng).toBe(77.5);
  });

  it("survives a single record's Cloudinary failure and still processes the rest of the batch", async () => {
    const employeeA = await createUserDirectly({
      name: "Failing Cleanup Employee",
      email: "failingcleanup@test.local",
      password: "Password123",
      role: "employee",
    });
    const employeeB = await createUserDirectly({
      name: "Succeeding Cleanup Employee",
      email: "succeedingcleanup@test.local",
      password: "Password123",
      role: "employee",
    });

    const recordA = await Attendance.create({
      employeeId: employeeA._id,
      date: daysAgo(60),
      checkIn: { time: daysAgo(60), photoUrl: "https://fake.cloudinary.test/fail.jpg", photoPublicId: "fail-id" },
    });
    const recordB = await Attendance.create({
      employeeId: employeeB._id,
      date: daysAgo(60),
      checkIn: { time: daysAgo(60), photoUrl: "https://fake.cloudinary.test/ok.jpg", photoPublicId: "ok-id" },
    });

    deleteCloudinaryAssetMock.mockImplementation(async (publicId) => {
      if (publicId === "fail-id") {
        throw new Error("Cloudinary is down");
      }
      return { result: "ok" };
    });

    const result = await runAttendancePhotoCleanupJob(new Date());

    expect(result.checked).toBe(2);
    expect(result.cleaned).toBe(1);
    expect(result.failed).toBe(1);

    const refreshedA = await Attendance.findById(recordA._id).select("+checkIn.photoPublicId");
    const refreshedB = await Attendance.findById(recordB._id).select("+checkIn.photoPublicId");
    // Failed record: left exactly as it was, not partially cleared.
    expect(refreshedA.checkIn.photoUrl).toBe("https://fake.cloudinary.test/fail.jpg");
    expect(refreshedA.checkIn.photoPublicId).toBe("fail-id");
    // The other record in the same batch still got cleaned successfully.
    expect(refreshedB.checkIn.photoUrl).toBeNull();
    expect(refreshedB.checkIn.photoPublicId).toBeNull();
  });

  it("still clears photoUrl for an old record with no photoPublicId at all, even though the Cloudinary asset itself can't be identified/deleted", async () => {
    const employee = await createUserDirectly({
      name: "No Public Id Employee",
      email: "nopublicid@test.local",
      password: "Password123",
      role: "employee",
    });

    // Simulates a record from before photoPublicId existed as a field.
    const record = await Attendance.create({
      employeeId: employee._id,
      date: daysAgo(60),
      checkIn: { time: daysAgo(60), photoUrl: "https://fake.cloudinary.test/legacy.jpg" },
    });

    const result = await runAttendancePhotoCleanupJob(new Date());

    expect(result.cleaned).toBe(1);
    expect(deleteCloudinaryAssetMock).not.toHaveBeenCalled();

    const refreshed = await Attendance.findById(record._id);
    expect(refreshed.checkIn.photoUrl).toBeNull();
  });
});
