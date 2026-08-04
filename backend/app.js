import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./src/route.js";
import errorHandlerMiddleware from "./src/middlewares/errorHandler.middleware.js";
import { env } from "./src/config/env.js";

const app = express();

// Origin allowlist rather than a single static string (2026-08-04) — accepts
// however many origins `env.clientOrigins` holds (production: always one;
// local dev: however many Vite port-drift needs, see env.js). A request with
// no Origin header at all (curl, server-to-server) is let through exactly as
// the previous static-string config already did — CORS only ever restricts
// what a BROWSER's fetch/XHR is allowed to read, never the server-side
// response itself. An origin outside the list gets `callback(null, false)`,
// not a thrown error — the request still completes normally server-side,
// it's just sent back with no Access-Control-Allow-Origin header, so the
// browser (not this server) blocks the calling page from reading it. This
// keeps the allowlist genuinely closed — no wildcard, no reflecting back
// whatever Origin was sent — while letting local dev list more than one.
app.use(
  cors({
    origin: (origin, callback) => callback(null, !origin || env.clientOrigins.includes(origin)),
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/health", (req, res) => {
  res.status(200).json({ success: true, message: "Server is healthy" });
});

app.use("/api/v1", router);

// Must be registered after all routes so it catches everything thrown above.
app.use(errorHandlerMiddleware);

export default app;
