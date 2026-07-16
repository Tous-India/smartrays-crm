import mongoose from "mongoose";

// passwordEncrypted/passwordIv are `select: false` — the same defense-in-depth
// pattern as User.passwordHash (user.model.js): a plain .find()/.findOne() never
// returns these fields even by accident. customer.service.js's reveal function
// is the only place that explicitly re-selects them.
const credentialSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    service: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      trim: true,
    },
    passwordEncrypted: {
      type: String,
      required: true,
      select: false,
    },
    passwordIv: {
      type: String,
      required: true,
      select: false,
    },
    url: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const Credential = mongoose.model("Credential", credentialSchema);

export default Credential;
