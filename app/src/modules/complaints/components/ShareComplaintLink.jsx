import { Linking, Pressable, Share, StyleSheet, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import Card from "../../../components/Card";
import { complaintFormUrl, complaintShareText } from "../complaints.utils";
import { colors, radius, spacing, typography } from "../../../theme";

/**
 * "Share complaint link" (2026-10-23) — the ONE public complaint form, sent
 * on WhatsApp, by SMS, or through the phone's share sheet (which also has
 * Copy). Free: each opens the phone's own app with the message ready.
 * Hidden when the build has no WEB_APP_URL to link to.
 */
function ShareComplaintLink() {
  const url = complaintFormUrl();
  if (!url) return null;
  const text = complaintShareText(url);

  const options = [
    { key: "whatsapp", label: "WhatsApp", icon: "logo-whatsapp", color: "#1d8343", run: () => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`) },
    { key: "sms", label: "SMS", icon: "chatbubble-outline", color: colors.brandNavy, run: () => Linking.openURL(`sms:?body=${encodeURIComponent(text)}`) },
    { key: "more", label: "More / Copy", icon: "share-social-outline", color: colors.brandNavy, run: () => Share.share({ message: text }) },
  ];

  return (
    <Card testID="share-complaint-link">
      <Text style={typography.label}>Share complaint link</Text>
      <Text style={[typography.small, styles.line]}>Customers tell us about a problem — or a new requirement — without logging in.</Text>
      <View style={styles.row}>
        {options.map((option) => (
          <Pressable
            key={option.key}
            onPress={() => option.run().catch(() => {})}
            accessibilityRole="button"
            accessibilityLabel={`Share on ${option.label}`}
            style={styles.button}
            testID={`share-${option.key}`}
          >
            <Ionicons name={option.icon} size={22} color={option.color} />
            <Text style={styles.buttonText}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  line: { marginTop: spacing.xs },
  row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  button: {
    flex: 1,
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: spacing.xs,
  },
  buttonText: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, textAlign: "center" },
});

export default ShareComplaintLink;
