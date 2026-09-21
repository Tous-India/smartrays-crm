import { Image, StyleSheet, View } from "react-native";
import { spacing } from "../theme";

const logo = require("../assets/logo-horizontal.png");

/** The horizontal colour logo, as the web's auth header shows it. */
function BrandHeader() {
  return (
    <View style={styles.container}>
      <Image source={logo} style={styles.logo} resizeMode="contain" accessibilityLabel="Smartrays" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", marginBottom: spacing.xxl },
  logo: { width: 176, height: 48 },
});

export default BrandHeader;
