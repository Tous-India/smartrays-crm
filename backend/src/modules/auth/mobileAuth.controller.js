import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { loginUser } from "./auth.service.js";
import { verifySecondFactor } from "./twoFactor.service.js";
import { rememberDevice } from "./trustedDevice.service.js";
import { issueMobileSession, rotateRefreshToken, revokeRefreshToken } from "./mobileSession.service.js";

/**
 * The mobile app's auth transport (mobile-backend-plan.md §1.3b) — sibling
 * routes to the web's, calling the SAME service functions (`loginUser`,
 * `verifySecondFactor`, `rememberDevice`). Only the transport differs: the
 * web puts the session in an httpOnly cookie and the trusted-device token in
 * a second cookie; the app gets a token pair in the body and sends the
 * trusted-device token back as the `X-Trusted-Device` header. Nothing here
 * sets or reads a cookie, and the web controllers are untouched.
 */

const TRUSTED_DEVICE_HEADER = "x-trusted-device";

function deviceFrom(req) {
  return {
    deviceId: req.body?.deviceId,
    deviceLabel: req.body?.deviceLabel || req.get("user-agent"),
  };
}

export const mobileLogin = asyncWrapper(async (req, res) => {
  const { email, password } = req.body;

  const result = await loginUser({
    email,
    password,
    // §7.40 — consulted by `loginUser` only AFTER the password has verified,
    // exactly as the web's cookie value is. The app stores it in the keychain.
    trustedDeviceToken: req.get(TRUSTED_DEVICE_HEADER),
  });

  // §7.38 — a second factor is outstanding: no session of any kind is issued.
  // The pre-auth token reaches /auth/mobile/2fa/verify and nothing else. Same
  // body shape as the web's challenge, so one screen serves both.
  if (result.preAuthToken) {
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          requiresTwoFactor: result.requiresTwoFactor,
          preAuthToken: result.preAuthToken,
          email: result.user.email,
          name: result.user.name,
        },
        "Enter your two-factor code to finish signing in"
      )
    );
  }

  const session = await issueMobileSession(result.user._id, deviceFrom(req));

  res.status(200).json(new ApiResponse(200, { user: result.user, ...session }, "Logged in successfully"));
});

export const mobileVerifyTwoFactor = asyncWrapper(async (req, res) => {
  const user = req.preAuthUser;

  const result = await verifySecondFactor(user._id, req.body.token);
  const session = await issueMobileSession(user._id, deviceFrom(req));

  // §7.40 — opt-in, and only on a TOTP verification, for the same reason the
  // web controller gives: a recovery code means the authenticator is gone and
  // `verifySecondFactor` has just revoked every trusted device. Returned in
  // the body; the app keeps it in the keychain and sends it as a header.
  let trustedDeviceToken;

  if (req.body.rememberDevice === true && result.method === "totp") {
    trustedDeviceToken = await rememberDevice(user._id, req.body.deviceLabel || req.get("user-agent"));
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        user,
        ...result,
        ...session,
        ...(trustedDeviceToken ? { trustedDeviceToken } : {}),
      },
      "Signed in successfully"
    )
  );
});

export const mobileRefresh = asyncWrapper(async (req, res) => {
  const session = await rotateRefreshToken(req.body.refreshToken);

  res.status(200).json(new ApiResponse(200, session, "Session refreshed"));
});

export const mobileLogout = asyncWrapper(async (req, res) => {
  await revokeRefreshToken(req.user._id, req.body.refreshToken);

  res.status(200).json(new ApiResponse(200, null, "Logged out successfully"));
});
