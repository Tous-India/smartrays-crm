import { Router } from "express";
import multer from "multer";
import ApiError from "../../utils/ApiError.js";
import { rateLimit } from "../../middlewares/rateLimit.middleware.js";
import { publicSubmit, publicStatus } from "./publicComplaint.controller.js";
import { PHOTO_LIMITS } from "./publicComplaint.service.js";

/**
 * The public complaint form's API (2026-10-23) — PUBLIC, no `authenticate`.
 * Mounted at /api/v1/public/complaints. One form for every customer; the
 * status page's token is the only credential for reading a complaint back.
 *
 * Abuse limits (per client address, kept in MongoDB so they hold across
 * Vercel instances): 5 submissions an hour; 60 status-page loads per 15
 * minutes.
 */
const publicComplaintRouter = Router();

const statusLimit = rateLimit({
  name: "complaint-status",
  windowSeconds: 15 * 60,
  max: 60,
  message: "Too many requests. Please try again in a few minutes.",
});
const submitPerAddress = rateLimit({
  name: "complaint-raise-ip",
  windowSeconds: 60 * 60,
  max: 5,
  message: "You have sent several requests in a short time. Please try again later, or call us.",
});

// Memory storage: photos go straight to Cloudinary after their content is
// checked. One more file than allowed is accepted by multer so the service can
// answer "up to 3 photos" in plain words; anything beyond that is cut off here.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PHOTO_LIMITS.maxBytes, files: PHOTO_LIMITS.maxCount + 1, fields: 16, fieldSize: 8 * 1024 },
}).array("photos", PHOTO_LIMITS.maxCount + 1);

function receivePhotos(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") return next(new ApiError(400, "Each photo must be smaller than 5 MB."));
    if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
      return next(new ApiError(400, `You can add up to ${PHOTO_LIMITS.maxCount} photos.`));
    }
    return next(new ApiError(400, "The form could not be read. Please try again."));
  });
}

publicComplaintRouter.post("/", submitPerAddress, receivePhotos, publicSubmit);
publicComplaintRouter.get("/status/:token", statusLimit, publicStatus);

export default publicComplaintRouter;
