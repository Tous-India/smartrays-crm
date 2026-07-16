import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./src/route.js";
import errorHandlerMiddleware from "./src/middlewares/errorHandler.middleware.js";
import { env } from "./src/config/env.js";

const app = express();

app.use(
  cors({
    origin: env.clientOrigin,
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
