import { loadTokens } from "../../store/tokenStorage";
import { flushQueue } from "./pingQueue.service";

/**
 * The headless task the tracking service starts while the app is closed
 * (FlushTaskService.kt): restore the token pair from the keychain into the
 * API client and push the queue. No tokens means nobody is signed in on this
 * install — nothing to send, and nothing to sign in as.
 */
export default async function flushTask() {
  const tokens = await loadTokens();

  if (!tokens) {
    return;
  }

  try {
    const summary = await flushQueue();
    console.log(`[tracking] headless flush: ${JSON.stringify(summary)}`);
  } catch (error) {
    console.log(`[tracking] headless flush failed: ${error.message}`);
  }
}
