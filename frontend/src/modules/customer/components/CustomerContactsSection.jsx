import { useState } from "react";
import { Card, List, Tag, Button, Popconfirm, Space, message } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import PermissionGate from "../../../routes/PermissionGate";
import ContactFormModal from "./ContactFormModal";
import { createContact, updateContact, deleteContact } from "../api/customerApi";

/**
 * Contacts Section per leads-customer-functional-spec.md: list + add/edit/
 * remove, primary-contact flag.
 */
function CustomerContactsSection({ customerId, contacts, onChanged }) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(values) {
    setIsSubmitting(true);

    try {
      if (editingContact) {
        await updateContact(customerId, editingContact._id, values);
        message.success("Contact updated");
      } else {
        await createContact(customerId, values);
        message.success("Contact added");
      }

      setIsFormOpen(false);
      setEditingContact(null);
      onChanged();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(contact) {
    await deleteContact(customerId, contact._id);
    message.success("Contact removed");
    onChanged();
  }

  return (
    <Card
      title="Contacts"
      className="mb-6"
      extra={
        <PermissionGate module="customers" action="edit">
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingContact(null);
              setIsFormOpen(true);
            }}
          >
            Add Contact
          </Button>
        </PermissionGate>
      }
    >
      <List
        dataSource={contacts}
        locale={{ emptyText: "No contacts yet" }}
        renderItem={(contact) => (
          <List.Item
            actions={[
              <PermissionGate key="edit" module="customers" action="edit">
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditingContact(contact);
                    setIsFormOpen(true);
                  }}
                />
              </PermissionGate>,
              <PermissionGate key="delete" module="customers" action="edit">
                <Popconfirm title="Remove this contact?" okText="Remove" okType="danger" onConfirm={() => handleRemove(contact)}>
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </PermissionGate>,
            ]}
          >
            <Space direction="vertical" size={0}>
              <Space>
                <span className="font-medium">{contact.name}</span>
                {contact.isPrimary && <Tag color="blue">Primary</Tag>}
              </Space>
              <span className="text-xs text-gray-500">
                {[contact.designation, contact.email, contact.phone].filter(Boolean).join(" · ") || "—"}
              </span>
            </Space>
          </List.Item>
        )}
      />

      <ContactFormModal
        open={isFormOpen}
        mode={editingContact ? "edit" : "create"}
        initialContact={editingContact}
        onCancel={() => {
          setIsFormOpen(false);
          setEditingContact(null);
        }}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </Card>
  );
}

export default CustomerContactsSection;
