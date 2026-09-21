/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);

// The tracking service's headless upload (FlushTaskService.kt) — runs the
// queue flush with no activity, through the same API client and keychain.
AppRegistry.registerHeadlessTask('SmartraysFlush', () => require('./src/modules/tracking/flushTask').default);
