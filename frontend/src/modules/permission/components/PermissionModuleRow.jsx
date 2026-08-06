import { Segmented, Tag, Tooltip, Typography } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import {
  LEVEL_LABELS,
  SCOPE_LABELS,
  labelForCapability,
  labelForModule,
  withLevel,
  withScope,
} from "../permissionModel";

const { Text } = Typography;

/**
 * One module = one row (§7.41, 2026-08-06).
 *
 * **The layout contract, which the tests assert:** this row never scrolls
 * sideways at any viewport. The two segmented controls are fixed-width and
 * the label column absorbs the remainder with `min-width: 0` + truncation —
 * without that `min-width`, a flex item refuses to shrink below its content
 * and pushes the row wider than its container, which is the single most
 * common way a layout like this starts scrolling horizontally.
 *
 * Adding a permission key must never widen this. That is why the row is built
 * from a module DESCRIPTOR rather than from the key list: a new action changes
 * what a level expands to, or adds one more wrapping chip, never a column.
 */
function PermissionModuleRow({
  descriptor,
  selection,
  onChange,
  previousDescription,
  isChanged,
  divergesFromTemplate,
  disabled,
}) {
  const fullLabel = labelForModule(descriptor.module);

  const levelOptions = descriptor.levels.map((level) => ({
    label: LEVEL_LABELS[level],
    value: level,
  }));

  const scopeOptions = descriptor.scopeTiers.map((tier) => ({
    label: SCOPE_LABELS[tier],
    value: tier,
  }));

  const scopeIsInert = !descriptor.hasScope || selection.level === "none";

  return (
    <div
      className="permission-row"
      data-testid={`permission-row-${descriptor.module}`}
      data-changed={isChanged ? "true" : "false"}
    >
      <div className="permission-row__main">
        <div className="permission-row__label">
          {/* `title` carries the full name, since the visible text truncates. */}
          <Text strong title={fullLabel} className="permission-row__label-text">
            {fullLabel}
          </Text>

          <div className="permission-row__meta">
            {isChanged && (
              <Tag color="gold" data-testid={`row-changed-${descriptor.module}`}>
                was {previousDescription}
              </Tag>
            )}
            {divergesFromTemplate && (
              <Tag color="purple" data-testid={`row-diverges-${descriptor.module}`}>
                differs from role template
              </Tag>
            )}
          </div>
        </div>

        <div className="permission-row__selectors">
          <div className="permission-row__level">
            {descriptor.capabilityOnly ? (
              <Tooltip title="This module has no graded access levels — use the toggles.">
                <div className="permission-row__inert" data-testid={`level-inert-${descriptor.module}`}>
                  Capability only
                </div>
              </Tooltip>
            ) : (
              <Segmented
                block
                size="small"
                disabled={disabled}
                aria-label={`${fullLabel} access level`}
                value={selection.level}
                options={levelOptions}
                onChange={(level) => onChange(withLevel(descriptor, selection, level))}
              />
            )}
          </div>

          <div className="permission-row__scope">
            {scopeIsInert ? (
              <Tooltip
                title={
                  descriptor.hasScope
                    ? "Set an access level first."
                    : descriptor.scopeDisabledReason
                }
              >
                <div
                  className="permission-row__inert"
                  data-testid={`scope-inert-${descriptor.module}`}
                >
                  <InfoCircleOutlined className="permission-row__inert-icon" />
                  {descriptor.hasScope ? "Scope" : "Scope n/a"}
                </div>
              </Tooltip>
            ) : (
              <Segmented
                block
                size="small"
                disabled={disabled}
                aria-label={`${fullLabel} scope`}
                value={selection.scope}
                options={scopeOptions}
                onChange={(tier) => onChange(withScope(descriptor, selection, tier))}
              />
            )}
          </div>
        </div>
      </div>

      {descriptor.capabilities.length > 0 && (
        <div className="permission-row__chips">
          {descriptor.capabilities.map((action) => {
            const isOn = selection.capabilities?.[action] === true;

            return (
              <button
                key={action}
                type="button"
                disabled={disabled}
                aria-pressed={isOn}
                className={`permission-chip${isOn ? " permission-chip--on" : ""}`}
                onClick={() =>
                  onChange({
                    ...selection,
                    capabilities: { ...selection.capabilities, [action]: !isOn },
                  })
                }
              >
                {labelForCapability(descriptor.module, action)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PermissionModuleRow;
