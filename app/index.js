/**
 * @format
 */

import { AppRegistry } from 'react-native';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import { getApps } from '@react-native-firebase/app';
import App from './App';
import { name as appName } from './app.json';

// Push (STEP 4): every message the backend sends carries a `notification`
// block, which Android displays itself while the app is in the background
// or closed — this handler has nothing to draw, and exists so the SDK does
// not warn that none was set. Only registered when the build has Firebase.
if (getApps().length > 0) {
  setBackgroundMessageHandler(getMessaging(), async () => {});
}

AppRegistry.registerComponent(appName, () => App);

// The tracking service's headless upload (FlushTaskService.kt) — runs the
// queue flush with no activity, through the same API client and keychain.
AppRegistry.registerHeadlessTask('SmartraysFlush', () => require('./src/modules/tracking/flushTask').default);
