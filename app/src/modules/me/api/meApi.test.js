import apiClient, { refreshClient } from "../../../api/apiClient";
import { saveTokens, clearTokens } from "../../../store/tokenStorage";
import { openPayslip } from "./meApi";

/**
 * The payslip download: a bearer request through the blob library to the
 * existing endpoint, the file handed to the phone's PDF viewer; a non-200
 * answer becomes the server's own message.
 */
function respond(config, status, data) {
  return Promise.resolve({ status, statusText: String(status), headers: {}, config, data });
}

beforeEach(async () => {
  jest.clearAllMocks();
  global.mockBlobUtil.fetches.length = 0;
  refreshClient.defaults.adapter = (config) => Promise.reject(Object.assign(new Error("Network Error"), { config, request: {} }));
  apiClient.defaults.adapter = async (config) => respond(config, 200, { data: { name: "Employee" } });
  await clearTokens();
  await saveTokens({ accessToken: "access-live", refreshToken: "refresh-1" });
});

test("fetches /payroll/:id/payslip with the bearer token into the cache, then opens it as a PDF", async () => {
  await openPayslip("p1", "payslip-2026-07.pdf");

  expect(global.mockBlobUtil.fetches).toEqual([
    { method: "GET", url: "http://test.local/api/v1/payroll/p1/payslip", headers: { Authorization: "Bearer access-live" } },
  ]);
  expect(global.mockBlobUtil.config).toHaveBeenCalledWith(expect.objectContaining({ appendExt: "pdf", path: "/cache/payslip-2026-07.pdf" }));
  expect(global.mockBlobUtil.android.actionViewIntent).toHaveBeenCalledWith("/cache/payslip.pdf", "application/pdf");
});

test("a refused download (a draft's 409) throws the server's message and opens nothing", async () => {
  global.mockBlobUtil.config.mockReturnValueOnce({
    fetch: jest.fn(async () => ({
      info: () => ({ status: 409 }),
      path: () => "/cache/x.pdf",
      text: async () => JSON.stringify({ success: false, message: "This period is not approved yet — a payslip is only issued once the figures are final" }),
    })),
  });

  await expect(openPayslip("p-draft", "payslip-2026-09.pdf")).rejects.toThrow("This period is not approved yet — a payslip is only issued once the figures are final");
  expect(global.mockBlobUtil.android.actionViewIntent).not.toHaveBeenCalled();
});
