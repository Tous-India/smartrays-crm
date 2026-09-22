import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import Screen from "../../../components/Screen";
import ScreenHeader from "../../../components/ScreenHeader";
import DateField from "../../../components/DateField";
import ToggleRow from "../../../components/ToggleRow";
import SegmentedControl from "../../../components/SegmentedControl";
import TextField from "../../../components/TextField";
import PrimaryButton from "../../../components/PrimaryButton";
import ErrorBanner from "../../../components/ErrorBanner";
import OfflineNote from "../../../components/OfflineNote";
import useIsOnline from "../../../hooks/useIsOnline";
import { requestLeave } from "../api/leaveApi";
import { LEAVE_TYPES } from "../leave.utils";
import { toDateKey } from "../../../utils/date.utils";
import { messageFromError } from "../../../utils/apiError.utils";
import { spacing, typography } from "../../../theme";

/**
 * Apply for leave (app-plan.md §1.6): a date range, the half-day switch,
 * paid or unpaid, and a reason — the exact body `POST /leave/request`
 * validates. The app checks only what would be a wasted request (nothing
 * picked, no reason); every rule about leave — the monthly quota, the
 * half-day-is-one-day rule, overlaps — is the server's, and its refusal is
 * shown word for word.
 *
 * Offline the button stays, disabled, with the reason (§3.3): a request is
 * a server record, not something to queue.
 */
function ApplyLeaveScreen({ navigation }) {
  const isOnline = useIsOnline();
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [type, setType] = useState(LEAVE_TYPES[0].value);
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // A field's own message goes away the moment the field is filled in.
  function clearFieldError(field) {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  function handleStartChange(date) {
    setStartDate(date);
    clearFieldError("startDate");

    // A half day is one day; otherwise the end never sits before the start.
    if (isHalfDay || !endDate || endDate < date) {
      setEndDate(date);
      clearFieldError("endDate");
    }
  }

  function handleEndChange(date) {
    setEndDate(date);
    clearFieldError("endDate");
  }

  function handleReasonChange(text) {
    setReason(text);
    clearFieldError("reason");
  }

  function handleHalfDayChange(next) {
    setIsHalfDay(next);

    if (next && startDate) {
      setEndDate(startDate);
    }
  }

  async function handleSubmit() {
    if (isSubmitting) {
      return;
    }

    const errors = {};

    if (!startDate) {
      errors.startDate = "Pick the first day";
    }

    if (!endDate) {
      errors.endDate = "Pick the last day";
    }

    if (!reason.trim()) {
      errors.reason = "A reason is required";
    }

    setFieldErrors(errors);
    setServerError(null);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      await requestLeave({
        startDate: toDateKey(startDate),
        endDate: toDateKey(endDate),
        type,
        isHalfDay,
        reason: reason.trim(),
      });
      navigation.goBack();
    } catch (error) {
      setServerError(messageFromError(error));
      setIsSubmitting(false);
    }
  }

  return (
    <Screen testID="apply-leave-screen">
      <ScreenHeader title="Apply for leave" onBack={() => navigation.goBack()} />

      <ErrorBanner message={serverError} testID="apply-leave-error" />

      <DateField label="From" value={startDate} onChange={handleStartChange} error={fieldErrors.startDate} testID="apply-leave-start" />
      <DateField
        label="To"
        value={endDate}
        onChange={handleEndChange}
        minimumDate={startDate || undefined}
        error={fieldErrors.endDate}
        testID="apply-leave-end"
      />
      <ToggleRow
        label="Half day"
        hint="One day only — the end date follows the start"
        value={isHalfDay}
        onValueChange={handleHalfDayChange}
        testID="apply-leave-half-day"
      />

      <Text style={[typography.label, styles.typeLabel]}>Type</Text>
      <SegmentedControl options={LEAVE_TYPES} value={type} onChange={setType} testID="apply-leave-type" />

      <TextField
        label="Reason"
        value={reason}
        onChangeText={handleReasonChange}
        error={fieldErrors.reason}
        placeholder="Why you need the time off"
        multiline
        numberOfLines={3}
        autoCapitalize="sentences"
        editable={!isSubmitting}
        style={styles.reason}
        testID="apply-leave-reason"
      />

      <PrimaryButton title="Submit request" onPress={handleSubmit} loading={isSubmitting} disabled={!isOnline} testID="apply-leave-submit" />
      {!isOnline ? <OfflineNote what="applying for leave" /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  typeLabel: { marginBottom: spacing.sm },
  reason: { minHeight: 88, textAlignVertical: "top" },
});

export default ApplyLeaveScreen;
