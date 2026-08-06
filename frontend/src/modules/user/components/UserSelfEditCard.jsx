import { useState } from "react";
import { Card, Switch, Typography, App } from "antd";
import { setCanEditOwnProfile } from "../api/selfApi";

const { Text } = Typography;

/**
 * Grants a user the right to edit their own name and phone (§7.39,
 * 2026-08-05).
 *
 * Defaults off org-wide: those fields identify someone in the org chart, and
 * letting anyone rename themselves freely makes it untrustworthy. A photo is
 * always self-editable and needs no grant, so it isn't represented here.
 *
 * Only that person's manager or an admin may set this — enforced server-side,
 * since the check needs the target's `managerId`. The control is shown to
 * anyone who can view the page; an unauthorised attempt surfaces the server's
 * own refusal rather than being silently hidden.
 */
function UserSelfEditCard({ user, onChanged }) {
  const { message } = App.useApp();
  const [isSaving, setIsSaving] = useState(false);

  async function handleToggle(checked) {
    setIsSaving(true);

    try {
      await setCanEditOwnProfile(user._id, checked);
      message.success(checked ? "They can now edit their own name and phone" : "Self-editing turned off");
      onChanged?.();
    } catch (error) {
      message.error(error.response?.data?.message || "Could not update this setting");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card title="Profile editing" className="mb-6 app-elevated-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">Let them edit their own name and phone</div>
          <Text type="secondary" className="text-xs">
            Their photo is always editable. Email, role and reporting line never are.
          </Text>
        </div>
        <Switch
          checked={Boolean(user?.canEditOwnProfile)}
          loading={isSaving}
          aria-label="Toggle self profile editing"
          onChange={handleToggle}
        />
      </div>
    </Card>
  );
}

export default UserSelfEditCard;
