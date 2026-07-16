import mongoose from "mongoose";
import { connectDatabase } from "../database/connection.js";
import { createUser } from "../modules/user/user.service.js";

/**
 * One-time bootstrap script. POST /auth/register requires an already-logged-in
 * admin, so the very first admin account has to be created directly against
 * the database instead of through the API. Run with: npm run seed:admin
 */
async function seedAdmin() {
  await connectDatabase();

  const adminName = process.env.SEED_ADMIN_NAME || "Admin";
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in your .env file to seed the first admin user."
    );
    process.exit(1);
  }

  const admin = await createUser({
    name: adminName,
    email: adminEmail,
    password: adminPassword,
    role: "admin",
  });

  console.log(`Admin user created: ${admin.email}`);

  await mongoose.disconnect();
  process.exit(0);
}

seedAdmin().catch((error) => {
  console.error("Failed to seed admin user:", error.message);
  process.exit(1);
});
