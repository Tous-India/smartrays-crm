import { Router } from "express";
import multer from "multer";
import ApiError from "../../utils/ApiError.js";
import { rateLimit } from "../../middlewares/rateLimit.middleware.js";
import { publicPage, publicRaise } from "./complaintLink.controller.js";
import { PHOTO_LIMITS } from "./publicComplaint.service.js";

/**
 * The customer complaint page's API — PUBLIC, no `authenticate`. Mounted at
 * /api/v1/public/complaints. The token in the path is the only credential;
 * every wrong token gets the same 404 (publicComplaint.service.js).
 *
 * Abuse limits (per client address, kept in MongoDB so they hold across
 * Vercel instances): 60 page loads per 15 minutes; 5 complaints per hour.
 * Plus 20 complaints a day per link, whatever the address.
 */
const publicComplaintRouter = Router();

const pageLimit = rateLimit({
  name: "complaint-page",
  windowSeconds: 15 * 60,
  max: 60,
  message: "Too many requests. Please try again in a few minutes.",
});
const raisePerAddress = rateLimit({
  name: "complaint-raise-ip",
  windowSeconds: 60 * 60,
  max: 5,
  message: "You have sent several complaints in a short time. Please try again later, or call us.",
});
const raisePerLink = rateLimit({
  name: "complaint-raise-link",
  windowSeconds: 24 * 60 * 60,
  max: 20,
  keyFrom: (req) => req.params.token,
  message: "This link has received many complaints today. Please try again tomorrow, or call us.",
});

// Memory storage: photos go straight to Cloudinary after their content is
// checked. One more file than allowed is accepted by multer so the service can
// answer "up to 3 photos" in plain words; anything beyond that is cut off here.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PHOTO_LIMITS.maxBytes, files: PHOTO_LIMITS.maxCount + 1, fields: 10, fieldSize: 8 * 1024 },
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

publicComplaintRouter.get("/:token", pageLimit, publicPage);
publicComplaintRouter.post("/:token", raisePerAddress, raisePerLink, receivePhotos, publicRaise);

export default publicComplaintRouter;
