import { useEffect, useState } from "react";
import { Modal, Form, Input, Select, DatePicker, Button, Space, Checkbox } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { listAssignees } from "../api/serviceApi";

/**
 * Create / edit a service (§7.72).
 *
 * THE ASSIGNEE PICKER IS SCOPED BY THE SERVER. Its options come from
 * `GET /services/assignees`, which returns exactly who the caller may assign
 * to — a manager sees their own team and themselves, an admin everyone. The
 * client never filters a wider list down; it renders what it is given.
 *
 * Options are loaded on open and the form's values are set only AFTER they
 * resolve, so an edit's pre-selected assignee always has a label to show (the
 * Select-value-without-option bug seen twice in this codebase, §7.70).
 */
function ServiceFormModal({ open, mode, initialService, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();
  const [assignees, setAssignees] = useState([]);
  const [isLoadingAssignees, setIsLoadingAssignees] = useState(false);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    let isMounted = true;
    setIsLoadingAssignees(true);

    listAssignees()
      .then((response) => {
        if (!isMounted) return;
        setAssignees(response.data.data);
        form.setFieldsValue(
          mode === "edit" && initialService
            ? {
                title: initialService.title,
                description: initialService.description,
                assignedToId: initialService.assignedToId,
                dueDate: initialService.dueDate ? dayjs(initialService.dueDate) : null,
                subtasks: initialService.subtasks.map((subtask) => ({ title: subtask.title, isDone: subtask.isDone })),
              }
            : { title: "", description: "", assignedToId: undefined, dueDate: null, subtasks: [] }
        );
      })
      .finally(() => {
        if (isMounted) setIsLoadingAssignees(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, mode, initialService, form]);

  async function handleOk() {
    let values;

    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    await onSubmit({
      title: values.title.trim(),
      description: values.description?.trim() || "",
      assignedToId: values.assignedToId,
      dueDate: values.dueDate ? values.dueDate.toISOString() : null,
      subtasks: (values.subtasks || []).filter((subtask) => subtask?.title?.trim()),
    });
  }

  function handleCancel() {
    form.resetFields();
    onCancel();
  }

  return (
    <Modal
      title={mode === "edit" ? "Edit Service" : "New Service"}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      okText={mode === "edit" ? "Save" : "Create"}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item label="Title" name="title" rules={[{ required: true, whitespace: true, message: "Title is required" }]}>
          <Input maxLength={160} />
        </Form.Item>

        <Form.Item label="Description" name="description">
          <Input.TextArea rows={3} maxLength={2000} />
        </Form.Item>

        <Form.Item label="Assign to" name="assignedToId" rules={[{ required: true, message: "Choose who does this" }]}>
          <Select
            showSearch
            optionFilterProp="label"
            loading={isLoadingAssignees}
            options={assignees.map((user) => ({ value: user._id, label: user.name }))}
            placeholder="Choose an assignee"
            notFoundContent={isLoadingAssignees ? "Loading…" : "No one you can assign to"}
          />
        </Form.Item>

        <Form.Item label="Due date" name="dueDate">
          <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
        </Form.Item>

        <Form.List name="subtasks">
          {(fields, { add, remove }) => (
            <div className="mb-4">
              <div className="mb-2 text-sm">Subtasks</div>
              {fields.map((field) => (
                <div key={field.key} className="mb-2 flex items-center gap-2">
                  <Form.Item name={[field.name, "isDone"]} valuePropName="checked" noStyle>
                    <Checkbox aria-label="Subtask done" />
                  </Form.Item>
                  <Form.Item name={[field.name, "title"]} noStyle rules={[{ required: true, whitespace: true, message: "Subtask needs a title" }]}>
                    <Input placeholder="Subtask" className="min-w-0 flex-1" />
                  </Form.Item>
                  <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove subtask" onClick={() => remove(field.name)} />
                </div>
              ))}
              <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => add({ title: "", isDone: false })}>
                Add subtask
              </Button>
            </div>
          )}
        </Form.List>

        <Space size={0} />
      </Form>
    </Modal>
  );
}

export default ServiceFormModal;
