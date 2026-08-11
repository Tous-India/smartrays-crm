import { useEffect } from "react";
import dayjs from "dayjs";
import { Modal, Form, Input, Select, InputNumber, DatePicker, Row, Col, Divider } from "antd";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useTeams from "../../team/hooks/useTeams";
import { USER_ROLES, USER_ROLE_LABELS, ROLE_PICKER_LABELS } from "../constants/user.constants";

// Create-mode-only role options (2026-07-30 rework) — "Customer" is removed
// entirely (customer accounts are only ever created via the existing self-
// signup, email-domain-match flow, never through internal User Management)
// and "Sales Associate" is dropped too, per this task's own explicit
// instruction: new sales_associate accounts can no longer be created from
// this form going forward. Existing sales_associate/customer accounts are
// completely unaffected — Edit mode below still shows the full USER_ROLES
// list, so an admin can still view/edit one without being blocked by this
// narrower create-only list.
//
// Labels come from the shared `ROLE_PICKER_LABELS` (user.constants.js) —
// the one place "Executive" is mapped onto the `employee` value — reused
// as-is here (and by the Permissions Role Defaults tab's own role picker)
// rather than a second hardcoded "Executive" string.
const CREATE_ROLE_OPTIONS = [
  { value: "manager", label: ROLE_PICKER_LABELS.manager },
  { value: "employee", label: ROLE_PICKER_LABELS.employee },
];

/**
 * Shared create/edit form for the User Management screen. Create posts to
 * the existing admin-gated `POST /auth/register` (no separate `POST /users`
 * — matches the backend's single account-creation path, see
 * backend/README.md's Auth section); edit uses the existing
 * `PATCH /users/:id`, which already allows an admin to set `role`/
 * `managerId`/`baseSalary` alongside `name`/`email`/`phone` — no new backend
 * endpoint needed for either mode.
 *
 * Create mode was reworked 2026-07-30 into a compact 4-row layout with a
 * "Department" field (a Team picker) replacing the standalone "Manager"
 * dropdown — DESIGN DECISION: selecting a Department automatically sets
 * this new user's `managerId` to that Team's `headManagerId`
 * (`team.model.js`'s existing relationship, no new field), rather than
 * offering Department and Manager as two independent fields that could
 * conflict with each other. If a fully independent Manager field alongside
 * Department was actually wanted, this resolves it differently — flag if
 * so. Edit mode's layout/fields are unchanged from before this rework.
 */

/**
 * Personal + Employment, defined ONCE and rendered by both create and edit
 * (§7.48, 2026-08-11).
 *
 * The two modes branch on `mode === "edit"` with separate field lists, and
 * that duplication is exactly how the salary label drifted — "Salary" in one,
 * "Base Salary" in the other, for the same field (fixed in 9ee7bea). Rather
 * than unify the whole form, which would fight the genuine differences (create
 * has password and a Department picker; edit has Role and Manager), only the
 * NEW sections are shared. That removes the drift risk where it would
 * otherwise be reintroduced, without pretending the Account section is the
 * same in both modes when it isn't.
 *
 * Two per row via `Col xs={24} sm={12}`, matching the Add Contact form.
 * Address takes a full row: an address wrapped into half a modal reads badly
 * and is the one free-text field here.
 */
function HrProfileSections() {
  return (
    <>
      <Divider orientation="left" orientationMargin={0}>
        Personal
      </Divider>
      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item label="Date of Birth" name="dateOfBirth">
            <DatePicker className="w-full" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label="Emergency Contact Name" name="emergencyContactName">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label="Emergency Contact Phone" name="emergencyContactPhone">
            <Input />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="Address" name="address">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left" orientationMargin={0}>
        Employment
      </Divider>
      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item label="Joining Date" name="joiningDate">
            <DatePicker className="w-full" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label="Base Salary" name="baseSalary">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}

function UserFormModal({ open, mode, initialUser, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();
  const { users } = useUserDirectory();
  const { teams } = useTeams();

  // A manager must be role "manager" or "admin" (enforced server-side too,
  // user.service.js#ensureValidManagerId) — narrow the picker to match so an
  // admin isn't offered a choice the backend will just reject.
  const managerOptions = users
    .filter((user) => user.role === "manager" || user.role === "admin")
    .map((user) => ({ value: user._id, label: user.name }));

  const teamOptions = teams.map((team) => ({
    value: team._id,
    label: team.type ? `${team.name} (${team.type})` : team.name,
    headManagerId: team.headManagerId,
  }));

  useEffect(() => {
    if (open) {
      // AntD DatePicker needs a dayjs value, not the ISO string the API
      // returns — without this the pickers render empty when editing a user
      // who HAS a date, which reads as "not set" and would silently clear it
      // on save.
      form.setFieldsValue(
        mode === "edit" && initialUser
          ? {
              ...initialUser,
              dateOfBirth: initialUser.dateOfBirth ? dayjs(initialUser.dateOfBirth) : null,
              joiningDate: initialUser.joiningDate ? dayjs(initialUser.joiningDate) : null,
            }
          : {}
      );
    }
  }, [open, mode, initialUser, form]);

  function handleDepartmentChange(teamId) {
    const team = teamOptions.find((option) => option.value === teamId);
    form.setFieldValue("managerId", team ? team.headManagerId : null);
  }

  async function handleOk() {
    const values = await form.validateFields();
    // `departmentTeamId` only exists to drive `handleDepartmentChange`
    // above — the real, submitted field is `managerId`, already derived
    // onto `values` by the hidden Form.Item.
    const { departmentTeamId, ...payload } = values;
    onSubmit(payload);
  }

  function handleCancel() {
    form.resetFields();
    onCancel();
  }

  return (
    <Modal
      title={mode === "edit" ? "Edit User" : "New User"}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      destroyOnHidden
      // AntD's Modal defaults to a fixed 520px, which is wider than a 390px
      // viewport and pushes the PAGE into horizontal scroll. Capping to the
      // viewport is what keeps this form usable on a phone; the sections
      // inside already collapse to one column below `sm`.
      style={{ maxWidth: "calc(100vw - 24px)" }}
    >
      {mode === "edit" ? (
        <Form form={form} layout="vertical">
          <Divider orientation="left" orientationMargin={0}>
            Account
          </Divider>
          <Form.Item label="Name" name="name" rules={[{ required: true, message: "Name is required" }]}>
            <Input />
          </Form.Item>

          <Form.Item
            label="Email"
            name="email"
            rules={[{ required: true, type: "email", message: "A valid email is required" }]}
          >
            <Input type="email" />
          </Form.Item>

          <Form.Item label="Phone" name="phone">
            <Input />
          </Form.Item>

          <Form.Item label="Role" name="role" rules={[{ required: true, message: "Role is required" }]}>
            <Select options={USER_ROLES.map((role) => ({ value: role, label: USER_ROLE_LABELS[role] }))} />
          </Form.Item>

          <Form.Item label="Manager" name="managerId">
            <Select allowClear placeholder="No manager" options={managerOptions} showSearch optionFilterProp="label" />
          </Form.Item>

          {/* §7.4g — shown beside the name on the today's roster. Admin-only
              (PRIVILEGED_FIELDS), so it appears here and not on EditProfile. */}
          <Form.Item label="Designation" name="designation">
            <Input placeholder="e.g. Field Technician" />
          </Form.Item>

          <HrProfileSections />
        </Form>
      ) : (
        <Form form={form} layout="vertical">
          <Divider orientation="left" orientationMargin={0}>
            Account
          </Divider>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Name" name="name" rules={[{ required: true, message: "Name is required" }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Email"
                name="email"
                rules={[{ required: true, type: "email", message: "A valid email is required" }]}
              >
                <Input type="email" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Phone" name="phone">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Password"
                name="password"
                rules={[
                  { required: true, message: "Password is required" },
                  { min: 8, message: "Password must be at least 8 characters" },
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Role" name="role" rules={[{ required: true, message: "Role is required" }]}>
                <Select options={CREATE_ROLE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Department" name="departmentTeamId">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={teamOptions}
                  placeholder="No department"
                  onChange={handleDepartmentChange}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Hidden — not user-facing, just carries the derived managerId
              (set by handleDepartmentChange above) through to submit. */}
          <Form.Item name="managerId" hidden>
            <Input />
          </Form.Item>

          {/* Base Salary now lives in the shared Employment section, so the
              two modes cannot drift apart again — it was "Salary" here and
              "Base Salary" in edit for the same field (9ee7bea). */}
          <HrProfileSections />
        </Form>
      )}
    </Modal>
  );
}

export default UserFormModal;
