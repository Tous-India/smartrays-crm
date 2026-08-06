import { useEffect, useMemo, useState } from "react";
import { Alert, App, Badge, Button, Empty, Input } from "antd";
import PermissionModuleRow from "./PermissionModuleRow";
import {
  buildSelections,
  changedModules,
  describeModule,
  describeSelection,
  diffPermissions,
  labelForModule,
  permissionsToSelection,
  selectionsToPermissions,
  wouldRemoveOwnPermissionManage,
} from "../permissionModel";

/**
 * The permissions matrix (§7.41, 2026-08-06) — rewritten from the old
 * checkbox grid, which had one column per action across the union of every
 * action in the registry and therefore scrolled horizontally on every screen
 * and got wider each time a module gained a key.
 *
 * Now: **one row per module**, access expressed as a level (None/View/Edit/
 * Full) plus a scope (Own/Team/All), with standalone capability keys as
 * toggle chips. Both selectors are fixed-width; the label column absorbs the
 * remainder and truncates. Adding a permission key changes what a level maps
 * to — never the column count, so the layout cannot grow sideways over time.
 *
 * `value` is the saved state and doubles as the baseline for the unsaved-
 * change markers. `templatePermissions`, when supplied by the user-override
 * screen, is a SECOND baseline used to mark divergence from the role's
 * template — the same comparison against a different reference. Template
 * drift has silently broken production twice in this project (see
 * `permission.service.js#reconcileRoleTemplate`), and the reconciler only
 * repairs templates, never existing users, so on a user this divergence is
 * permanent until someone resets it. Showing it is the point.
 *
 * The server remains the source of truth: `validatePermissionsBody` still
 * rejects anything invalid, and nothing here loosens that.
 */
function PermissionMatrix({
  registry,
  value,
  onSave,
  isSaving,
  templatePermissions = null,
  isEditingSelf = false,
}) {
  const { modal } = App.useApp();
  const [selections, setSelections] = useState(() => buildSelections(registry, value));
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setSelections(buildSelections(registry, value));
  }, [value, registry]);

  const descriptors = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(registry).map((moduleName) => [moduleName, describeModule(moduleName, registry)])
      ),
    [registry]
  );

  // What this state would save as — computed once and reused for the change
  // count, the per-row markers and the save payload, so the badge can never
  // disagree with what actually gets sent.
  const pending = useMemo(
    () => selectionsToPermissions(registry, selections),
    [registry, selections]
  );

  const changed = useMemo(() => changedModules(registry, value, pending), [registry, value, pending]);
  const changedKeyCount = useMemo(
    () => diffPermissions(registry, value, pending).length,
    [registry, value, pending]
  );

  const divergentModules = useMemo(
    () => (templatePermissions ? changedModules(registry, templatePermissions, value) : new Set()),
    [registry, templatePermissions, value]
  );

  const visibleModules = useMemo(() => {
    const needle = filter.trim().toLowerCase();

    return Object.keys(registry).filter(
      (moduleName) => !needle || labelForModule(moduleName).toLowerCase().includes(needle)
    );
  }, [registry, filter]);

  function handleSave() {
    // §7.41 item 7 — removing your OWN permissions.manage is the one change
    // that can lock you out of this page entirely, and there is no in-app way
    // back afterwards. Confirm explicitly rather than relying on the generic
    // save button.
    if (wouldRemoveOwnPermissionManage({ isEditingSelf, current: value, next: pending })) {
      modal.confirm({
        title: "Remove your own permission management access?",
        okText: "Remove it",
        okButtonProps: { danger: true },
        cancelText: "Cancel",
        content:
          "You are about to remove permissions.manage from your own account. You will lose access to this page immediately after saving, and you will not be able to grant it back yourself — another admin would have to do it.",
        onOk: () => onSave(pending),
      });

      return;
    }

    onSave(pending);
  }

  return (
    <div className="permission-matrix flex flex-col gap-4">
      <style>{`
        /*
          Scoped here rather than in styles/index.css deliberately — that file
          carries concurrent uncommitted work from other sessions, and this
          component already took the same approach for its checkbox-contrast
          fix (2026-07-30). Nothing here leaks outside .permission-matrix.
        */
        .permission-matrix { min-width: 0; }

        .permission-row {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px 14px;
          border: 1px solid #f0f0f0;
          border-radius: 8px;
          background: #fff;
          min-width: 0;
        }
        .permission-row[data-changed="true"] {
          border-color: #ffd666;
          background: #fffdf5;
        }

        /*
          The wrap point. Above it, label and selectors share a line; below it
          the selectors drop beneath the label. Never a sideways scroll.
        */
        .permission-row__main {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        /*
          min-width: 0 is load-bearing — a flex item defaults to min-width:auto
          and refuses to shrink below its text, which is exactly what pushes a
          row past its container and starts horizontal scrolling.
        */
        .permission-row__label {
          flex: 1 1 220px;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .permission-row__label-text {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .permission-row__meta {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          min-width: 0;
        }
        .permission-row__meta .ant-tag {
          margin-inline-end: 0;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Fixed-width selectors — they also wrap against each other at 390px. */
        .permission-row__selectors {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          flex: 0 1 auto;
          min-width: 0;
        }
        .permission-row__level { flex: 0 0 236px; max-width: 100%; }
        .permission-row__scope { flex: 0 0 172px; max-width: 100%; }

        .permission-row__inert {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 24px;
          padding: 0 8px;
          border: 1px dashed #d9d9d9;
          border-radius: 6px;
          color: #bfbfbf;
          font-size: 12px;
          background: #fafafa;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          cursor: not-allowed;
        }
        .permission-row__inert-icon { font-size: 11px; }

        /* Chips wrap onto as many lines as they need; they never widen a row. */
        .permission-row__chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          min-width: 0;
        }
        .permission-chip {
          border: 1px solid #d9d9d9;
          border-radius: 999px;
          background: #fff;
          color: #595959;
          font-size: 12px;
          line-height: 1.4;
          padding: 3px 10px;
          cursor: pointer;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .permission-chip:hover:not(:disabled) { border-color: #1f3a8a; color: #1f3a8a; }
        .permission-chip--on {
          background: #1f3a8a;
          border-color: #1f3a8a;
          color: #fff;
          font-weight: 500;
        }
        .permission-chip:disabled { cursor: not-allowed; opacity: 0.6; }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input.Search
          allowClear
          placeholder="Filter modules"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          style={{ maxWidth: 260 }}
        />

        <div className="flex items-center gap-3">
          <Badge count={changedKeyCount} data-testid="unsaved-count" showZero={false}>
            <span className="text-sm text-gray-500 pr-2">
              {changedKeyCount === 0
                ? "No unsaved changes"
                : `${changedKeyCount} unsaved change${changedKeyCount === 1 ? "" : "s"}`}
            </span>
          </Badge>
          <Button
            type="primary"
            loading={isSaving}
            disabled={changedKeyCount === 0}
            onClick={handleSave}
          >
            Save
          </Button>
        </div>
      </div>

      {templatePermissions && divergentModules.size > 0 && (
        <Alert
          type="info"
          showIcon
          data-testid="template-divergence-banner"
          message={`${divergentModules.size} module${divergentModules.size === 1 ? "" : "s"} differ from this user's role template`}
          description="Marked rows have been customized for this user, or the role template changed after this account was created. Reset to Role Default clears every customization."
        />
      )}

      <div className="flex flex-col gap-2">
        {visibleModules.length === 0 ? (
          <Empty description="No modules match that filter" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          visibleModules.map((moduleName) => {
            const descriptor = descriptors[moduleName];

            return (
              <PermissionModuleRow
                key={moduleName}
                descriptor={descriptor}
                selection={selections[moduleName]}
                isChanged={changed.has(moduleName)}
                divergesFromTemplate={divergentModules.has(moduleName)}
                previousDescription={describeSelection(
                  descriptor,
                  permissionsToSelection(descriptor, value?.[moduleName])
                )}
                onChange={(next) =>
                  setSelections((current) => ({ ...current, [moduleName]: next }))
                }
              />
            );
          })
        )}
      </div>
    </div>
  );
}

export default PermissionMatrix;
