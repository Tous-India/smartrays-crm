import { StyleSheet, Text, View } from "react-native";
import Screen from "../../../components/Screen";
import BrandHeader from "../../../components/BrandHeader";
import PrimaryButton from "../../../components/PrimaryButton";
import useSessionStore from "../../../store/sessionStore";
import { signOut } from "../session.service";
import { roleLabel } from "../../../constants/roles.constants";
import { spacing, typography } from "../../../theme";

/**
 * Sales associate and customer accounts are out of the app's scope
 * (app-plan.md, scope decision; admin joined the app 2026-10-23): their work
 * is the web app's. The account signed in fine — this says so, and offers
 * the way back out.
 */
function UnsupportedRoleScreen() {
  const user = useSessionStore((state) => state.user);
  const greeting = user?.name ? `${user.name}, your` : "Your";

  return (
    <Screen centered testID="unsupported-role-screen">
      <BrandHeader />
      <View style={styles.body}>
        <Text style={typography.title}>This app is for field staff</Text>
        <Text style={[typography.subtitle, styles.text]}>
          {greeting} account ({roleLabel(user?.role)}) uses the web CRM. Employee, sales associate, manager and admin accounts sign in here.
        </Text>
        <PrimaryButton title="Sign out" onPress={signOut} testID="unsupported-sign-out" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: "stretch" },
  text: { marginTop: spacing.sm, marginBottom: spacing.xl },
});

export default UnsupportedRoleScreen;
