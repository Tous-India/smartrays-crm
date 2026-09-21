import { StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import RootNavigator from "./src/navigation/RootNavigator";
import { colors } from "./src/theme";

/**
 * The app root: providers around the navigator, nothing else. State lives in
 * src/store, screens in src/modules — the same modular shape as the web.
 */
function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.page} />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

export default App;
