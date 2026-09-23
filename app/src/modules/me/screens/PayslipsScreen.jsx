import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import Screen from "../../../components/Screen";
import ScreenHeader from "../../../components/ScreenHeader";
import Card from "../../../components/Card";
import StatusPill from "../../../components/StatusPill";
import ListState from "../../../components/ListState";
import ErrorBanner from "../../../components/ErrorBanner";
import OfflineNote from "../../../components/OfflineNote";
import useServerData from "../../../hooks/useServerData";
import useIsOnline from "../../../hooks/useIsOnline";
import { listMyPayroll, openPayslip } from "../api/meApi";
import { formatPayrollMonth, formatRupees, payslipRecords } from "../me.utils";
import { messageFromError } from "../../../utils/apiError.utils";
import { colors, spacing, typography } from "../../../theme";

/**
 * Payslips (app-plan.md §1.6): the caller's approved and paid payroll
 * periods — never a draft or a period under review, which have no payslip
 * yet (the server 409s on purpose) — and a tap opens the PDF the existing
 * endpoint renders. Figures on the row are the record's own; the payslip
 * is the document of record.
 */
function PayslipsScreen({ navigation }) {
  const isOnline = useIsOnline();
  const payroll = useServerData(async () => payslipRecords((await listMyPayroll()).data.data), { initialData: [] });
  const [openingId, setOpeningId] = useState(null);
  const [openError, setOpenError] = useState(null);

  async function handleOpen(record) {
    if (openingId) {
      return;
    }

    setOpeningId(record._id);
    setOpenError(null);

    try {
      await openPayslip(record._id, `payslip-${record.year}-${String(record.month).padStart(2, "0")}.pdf`);
    } catch (error) {
      setOpenError(messageFromError(error));
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <Screen onRefresh={payroll.refetch} refreshing={payroll.isRefreshing} testID="payslips-screen">
      <ScreenHeader title="Payslips" subtitle="Approved payroll periods" onBack={() => navigation.goBack()} />

      <ErrorBanner message={openError} testID="payslip-open-error" />
      {!isOnline ? <OfflineNote what="opening a payslip" /> : null}

      <ListState
        isLoading={payroll.isLoading}
        error={payroll.error}
        isEmpty={payroll.data.length === 0}
        emptyText="No approved payslips yet."
        onRetry={payroll.refetch}
        skeleton="leave"
        skeletonCount={2}
        testID="payslips-list"
      />

      {!payroll.isLoading && !payroll.error
        ? payroll.data.map((record) => (
            <Card key={record._id} onPress={isOnline && !openingId ? () => handleOpen(record) : undefined} testID={`payslip-row-${record._id}`}>
              <View style={styles.rowHeader}>
                <Text style={[typography.body, styles.month]}>{formatPayrollMonth(record)}</Text>
                <StatusPill label={record.status} tone={record.status === "paid" ? "success" : "neutral"} />
              </View>
              <View style={styles.rowFooter}>
                <Text style={typography.small}>Net {formatRupees(record.netAmount)}</Text>
                {openingId === record._id ? (
                  <ActivityIndicator color={colors.brandNavy} />
                ) : (
                  <View style={styles.openHint}>
                    <Text style={[typography.small, styles.openText]}>Open PDF</Text>
                    <Ionicons name="open-outline" size={16} color={colors.brandNavy} />
                  </View>
                )}
              </View>
            </Card>
          ))
        : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  rowFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  month: { fontWeight: "600" },
  openHint: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  openText: { color: colors.brandNavy, fontWeight: "600" },
});

export default PayslipsScreen;
