import { loadTokens } from "../../store/tokenStorage";
import { flushQueue } from "./pingQueue.service";
import { reconcileWithServer } from "./tracking.service";

/**
 * The headless task the tracking service starts while the app is closed
 * (FlushTaskService.kt): restore the token pair from the keychain into the
 * API client, ask the server whether the shift is still open — the boot
 * receiver restarts the engine from a saved flag, and a shift can be closed
 * from the web while the phone is in a pocket — then push the queue. No
 * tokens means nobody is signed in on this install: nothing to send, nothing
 * to sign in as.
 */
export default async function flushTask() {
  const tokens = await loadTokens();

  if (!tokens) {
    return;
  }

  try {
    const openRecord = await reconcileWithServer();
    console.log(`[tracking] headless reconcile: shift ${openRecord ? "open" : "closed"}`);
  } catch (error) {
    console.log(`[tracking] headless reconcile failed: ${error.message}`);
  }

  try {
    const summary = await flushQueue();
    console.log(`[tracking] headless flush: ${JSON.stringify(summary)}`);
  } catch (error) {
    console.log(`[tracking] headless flush failed: ${error.message}`);
  }
}
