import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SCREENS } from "../constants/screens.constants";
import LoginScreen from "../modules/auth/screens/LoginScreen";

const Stack = createNativeStackNavigator();

/** Signed-out: sign in, and the second-factor step when the account has one. */
function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name={SCREENS.LOGIN} component={LoginScreen} />
    </Stack.Navigator>
  );
}

export default AuthNavigator;
