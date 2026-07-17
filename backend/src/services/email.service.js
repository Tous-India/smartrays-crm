import nodemailer from "nodemailer";
import { env } from "../config/env.js";

/**
 * One shared SMTP transporter for the whole app, same pattern as
 * webPush.service.js/cloudinary.service.js — configured once at import time
 * from env, mocked at the module boundary in tests (no test ever sends a
 * real email). Nodemailer's `createTransport()` does not validate the host/
 * port/credentials synchronously (unlike `web-push`'s `setVapidDetails()`),
 * so this is safe to construct eagerly without risking an import-time crash
 * across the whole test suite the way an invalid VAPID key would.
 */
const transporter = nodemailer.createTransport({
  host: env.smtpHost,
  port: Number(env.smtpPort),
  secure: Number(env.smtpPort) === 465,
  auth: {
    user: env.smtpUser,
    pass: env.smtpPassword,
  },
});

/**
 * Sends the password-reset email. Deliberately thin (one function, one
 * purpose) rather than a generic `sendEmail(to, subject, html)` — there is
 * only one transactional email in the app so far; a generic wrapper would be
 * speculative abstraction ahead of a second real use case.
 */
export async function sendPasswordResetEmail({ to, resetUrl }) {
  await transporter.sendMail({
    from: env.smtpFrom,
    to,
    subject: "Reset your Smartrays CMS password",
    html: `
      <p>We received a request to reset your Smartrays CMS password.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}
