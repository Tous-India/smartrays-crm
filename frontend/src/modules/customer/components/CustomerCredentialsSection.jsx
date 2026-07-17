import { useState } from "react";
import { Card, List, Button, Popconfirm, Space, Typography, message } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeInvisibleOutlined } from "@ant-design/icons";
import PermissionGate from "../../../routes/PermissionGate";
import CredentialFormModal from "./CredentialFormModal";
import {
  createCredential,
  updateCredential,
  deleteCredential,
  revealCredential,
} from "../api/customerApi";

const { Text } = Typography;

/**
 * Credentials Vault per leads-customer-functional-spec.md — masked by
 * default, click-to-reveal, gated behind `credentials.view` (§7.2: required
 * on top of `customers.view`/`customers.edit` for every credentials
 * sub-route). The whole section is wrapped in a `PermissionGate` by the
 * parent (`CustomerDetailPage`), matching "only visible to users with
 * credentials.view permission" literally — not just disabled, hidden.
 *
 * Reveal is deliberately NOT automatic: the password only appears after an
 * explicit confirm-click on that row (`Popconfirm`, "Reveal password?"),
 * and reverts to masked on a second click — never decrypted just because
 * the page loaded. Every reveal is audited server-side
 * (`customer.service.js#revealCredential` writes to the activity log), so
 * treating it as a deliberate action here matches what the backend actually
 * does with it.
 */
function CustomerCredentialsSection({ customerId, credentials, onChanged }) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [revealedPasswords, setRevealedPasswords] = useState({});

  async function handleSubmit(values) {
    setIsSubmitting(true);

    try {
      if (editingCredential) {
        await updateCredential(customerId, editingCredential._id, values);
        message.success("Credential updated");
      } else {
        await createCredential(customerId, values);
        message.success("Credential added");
      }

      setIsFormOpen(false);
      setEditingCredential(null);
      onChanged();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(credential) {
    await deleteCredential(customerId, credential._id);
    message.success("Credential removed");
    onChanged();
  }

  async function handleReveal(credential) {
    const response = await revealCredential(customerId, credential._id);
    setRevealedPasswords((current) => ({ ...current, [credential._id]: response.data.data.password }));
  }

  function handleHide(credentialId) {
    setRevealedPasswords((current) => {
      const next = { ...current };
      delete next[credentialId];
      return next;
    });
  }

  return (
    <Card
      title="Credentials Vault"
      className="mb-6"
      extra={
        <PermissionGate module="customers" action="edit">
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingCredential(null);
              setIsFormOpen(true);
            }}
          >
            Add Credential
          </Button>
        </PermissionGate>
      }
    >
      <List
        dataSource={credentials}
        locale={{ emptyText: "No credentials saved yet" }}
        renderItem={(credential) => {
          const isRevealed = credential._id in revealedPasswords;

          return (
            <List.Item
              actions={[
                <PermissionGate key="edit" module="customers" action="edit">
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditingCredential(credential);
                      setIsFormOpen(true);
                    }}
                  />
                </PermissionGate>,
                <PermissionGate key="delete" module="customers" action="edit">
                  <Popconfirm title="Remove this credential?" okText="Remove" okType="danger" onConfirm={() => handleRemove(credential)}>
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </PermissionGate>,
              ]}
            >
              <Space direction="vertical" size={0} className="w-full">
                <Space>
                  <span className="font-medium">{credential.service}</span>
                  {credential.username && <Text type="secondary">{credential.username}</Text>}
                </Space>
                <Space>
                  <Text code>{isRevealed ? revealedPasswords[credential._id] : "••••••••"}</Text>
                  {isRevealed ? (
                    <Button
                      size="small"
                      type="link"
                      icon={<EyeInvisibleOutlined />}
                      onClick={() => handleHide(credential._id)}
                    >
                      Hide
                    </Button>
                  ) : (
                    <Popconfirm
                      title="Reveal password?"
                      description="This action is logged to the customer's activity log."
                      okText="Reveal"
                      onConfirm={() => handleReveal(credential)}
                    >
                      <Button size="small" type="link">
                        Reveal
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
                {credential.url && (
                  <a href={credential.url} target="_blank" rel="noreferrer" className="text-xs">
                    {credential.url}
                  </a>
                )}
                {credential.notes && <Text type="secondary" className="text-xs">{credential.notes}</Text>}
              </Space>
            </List.Item>
          );
        }}
      />

      <CredentialFormModal
        open={isFormOpen}
        mode={editingCredential ? "edit" : "create"}
        initialCredential={editingCredential}
        onCancel={() => {
          setIsFormOpen(false);
          setEditingCredential(null);
        }}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </Card>
  );
}

export default CustomerCredentialsSection;
