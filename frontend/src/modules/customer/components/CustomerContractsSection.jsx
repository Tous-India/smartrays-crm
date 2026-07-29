import { useState } from "react";
import { Card, List, Tag, Button, Popconfirm, Space, message } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import PermissionGate from "../../../routes/PermissionGate";
import ContractFormModal from "./ContractFormModal";
import { createContract, updateContract, deleteContract } from "../api/customerApi";
import { CONTRACT_TYPE_COLORS, CONTRACT_TYPE_LABELS } from "../constants/customer.constants";

const AUTOMATION_CONTRACT_TYPES = ["monthly", "onetime"];

/**
 * Contracts Section per leads-customer-functional-spec.md: list, add/edit/
 * remove. Adding a monthly/onetime contract auto-creates a Project + draft
 * Invoice server-side (`customer.service.js#applyContractCreatedAutomation`)
 * — surfaced via a toast, since it's otherwise invisible. Removing a
 * contract completes its linked Project and cancels its linked Invoice
 * (`customer.service.js#deleteContract`) — a real, non-obvious side effect,
 * so the removal confirmation names it explicitly rather than a generic
 * "Are you sure?", per this task's own instruction.
 */
function CustomerContractsSection({ customerId, contracts, canEdit, onChanged }) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(values) {
    setIsSubmitting(true);

    try {
      if (editingContract) {
        await updateContract(customerId, editingContract._id, values);
        message.success("Contract updated");
      } else {
        await createContract(customerId, values);

        if (AUTOMATION_CONTRACT_TYPES.includes(values.type)) {
          message.success(
            `Contract added — Project + draft Invoice auto-created (${CONTRACT_TYPE_LABELS[values.type]})`
          );
        } else {
          message.success("Contract added");
        }
      }

      setIsFormOpen(false);
      setEditingContract(null);
      onChanged();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(contract) {
    await deleteContract(customerId, contract._id);
    message.success("Contract removed — its linked project was completed and its invoice cancelled");
    onChanged();
  }

  return (
    <Card
      title="Contracts"
      className="mb-6 app-elevated-card"
      extra={
        <PermissionGate module="customers" action="edit">
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingContract(null);
              setIsFormOpen(true);
            }}
          >
            Add Contract
          </Button>
        </PermissionGate>
      }
    >
      <List
        dataSource={contracts}
        locale={{ emptyText: "No contracts yet" }}
        renderItem={(contract) => (
          <List.Item
            actions={
              canEdit
                ? [
                    <PermissionGate key="edit" module="customers" action="edit">
                      <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => {
                          setEditingContract(contract);
                          setIsFormOpen(true);
                        }}
                      />
                    </PermissionGate>,
                    <PermissionGate key="delete" module="customers" action="edit">
                      <Popconfirm
                        title="Remove this contract?"
                        description="This completes its linked project and cancels its linked invoice."
                        okText="Remove"
                        okType="danger"
                        onConfirm={() => handleRemove(contract)}
                      >
                        <Button type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </PermissionGate>,
                  ]
                : []
            }
          >
            <Space>
              <Tag color={CONTRACT_TYPE_COLORS[contract.type]}>{CONTRACT_TYPE_LABELS[contract.type]}</Tag>
              <span>{contract.label || "—"}</span>
              {contract.amount != null && <span className="text-gray-500">₹{contract.amount.toLocaleString()}</span>}
              {contract.renewalDate && (
                <span className="text-gray-500">
                  Renews {new Date(contract.renewalDate).toLocaleDateString()}
                </span>
              )}
            </Space>
          </List.Item>
        )}
      />

      <ContractFormModal
        open={isFormOpen}
        mode={editingContract ? "edit" : "create"}
        initialContract={editingContract}
        onCancel={() => {
          setIsFormOpen(false);
          setEditingContract(null);
        }}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </Card>
  );
}

export default CustomerContractsSection;
