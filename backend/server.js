import app from "./app.js";
import { connectDatabase } from "./src/database/connection.js";
import { env } from "./src/config/env.js";
import { registerPayrollCron } from "./src/cron/payrollCron.js";

async function startServer() {
  await connectDatabase();
  registerPayrollCron();

  app.listen(env.port, () => {
    console.log(`Server is running on port ${env.port}`);
  });
}

startServer();
