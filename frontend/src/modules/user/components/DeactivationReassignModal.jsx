import { Modal, Form, Select } from "antd";

const TEAM_HEAD_ROLES = ["manager", "admin"];
const LEAD_OWNER_ROLES = ["sales_associate", "employee", "manager"];

/**
 * Shown BEFORE the final Deactivate confirmation (§7.31, 2026-07-31) only
 * when `GET /users/:id/deactivation-impact` returned something to resolve —
 * a reversal of the earlier hard-block guard (§7.28), which just refused to
 * deactivate a team head at all. Now the admin picks a new head per led
 * team (filtered to manager/admin, the same rule `ensureValidManagerId`
 * enforces server-side) and, if the person owns still-open leads, a single
 * new owner for all of them (filtered to a reasonable owner —
 * sales_associate/employee/manager). The final Deactivate button in this
 * modal stays disabled until every required field is filled — `Form`'s own
 * `shouldUpdate` re-render is used to recompute that on every keystroke
 * rather than tracking a parallel "is it valid" boolean by hand.
 */
function DeactivationReassignModal({ open, user, impact, users, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();

  const teamHeadOptions = users
    .filter((candidate) => TEAM_HEAD_ROLES.includes(candidate.role) && candidate._id !== user?._id)
    .map((candidate) => ({ value: candidate._id, label: candidate.name }));

  const leadOwnerOptions = users
    .filter((candidate) => LEAD_OWNER_ROLES.includes(candidate.role) && candidate._id !== user?._id)
    .map((candidate) => ({ value: candidate._id, label: candidate.name }));

  const teamsLed = impact?.teamsLed || [];
  const ownedLeadsCount = impact?.ownedLeadsCount || 0;

  async function handleOk() {
    let values;

    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    const reassignTeamsTo = {};
    teamsLed.forEach((team) => {
      reassignTeamsTo[team._id] = values.reassignTeamsTo[team._id];
    });

    await onSubmit({
      reassignTeamsTo,
      reassignLeadsTo: ownedLeadsCount > 0 ? values.reassignLeadsTo : undefined,
    });
    form.resetFields();
  }

  function handleCancel() {
    form.resetFields();
    onCancel();
  }

  return (
    <Modal
      title="Reassign Before Deactivating"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      okText="Deactivate"
      okButtonProps={{ danger: true }}
      destroyOnHidden
    >
      <p className="mb-4">
        {user?.name} leads {teamsLed.length} team(s) and/or owns active leads that need a new
        owner before they can be deactivated.
      </p>

      <Form form={form} layout="vertical">
        {teamsLed.map((team) => (
          <Form.Item
            key={team._id}
            label={`New head for "${team.name}" (${team.memberCount} member(s))`}
            name={["reassignTeamsTo", team._id]}
            rules={[{ required: true, message: "A new head is required" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={teamHeadOptions}
              placeholder="Select a manager or admin"
            />
          </Form.Item>
        ))}

        {ownedLeadsCount > 0 && (
          <Form.Item
            label={`Reassign ${ownedLeadsCount} active lead(s) to`}
            name="reassignLeadsTo"
            rules={[{ required: true, message: "A new owner is required" }]}
          >
            <Select showSearch optionFilterProp="label" options={leadOwnerOptions} placeholder="Select a new owner" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

export default DeactivationReassignModal;
