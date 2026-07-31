import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigProvider, App as AntApp, Button, message } from "antd";

/**
 * Regression test for a real, previously-silent bug (found 2026-07-31 while
 * diagnosing a "Deactivate does nothing" report): this app runs React 19,
 * which removed the legacy `ReactDOM.render` API that AntD v5's STATIC
 * `message.xxx()`/`notification.xxx()` calls (a plain `import { message }
 * from "antd"`, not a hook) rely on internally. The call itself never
 * throws — it just silently fails to mount anything, so every toast in the
 * app was invisible while every unit test asserting `message.success` was
 * *called* (via a mock) kept passing, since a mocked call can never catch a
 * real rendering failure. `App.useApp()`'s hook-based `message` renders
 * through the normal React tree instead and is unaffected. These tests
 * deliberately do NOT mock "antd" — they need the real rendering behavior to
 * prove the difference.
 */
describe("AntD message rendering under React 19 (regression)", () => {
  it("a static message.xxx() call — the broken pattern — never renders a toast", async () => {
    function BrokenComponent() {
      return <Button onClick={() => message.success("Static toast")}>Trigger</Button>;
    }

    render(
      <ConfigProvider>
        <BrokenComponent />
      </ConfigProvider>
    );

    await userEvent.click(screen.getByRole("button", { name: "Trigger" }));

    // Give it every reasonable chance to appear before asserting it never does.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByText("Static toast")).not.toBeInTheDocument();
  });

  it("App.useApp()'s hook-based message — the fixed pattern — actually renders a toast", async () => {
    function FixedComponent() {
      const { message: hookMessage } = AntApp.useApp();
      return <Button onClick={() => hookMessage.success("Hook toast")}>Trigger</Button>;
    }

    render(
      <ConfigProvider>
        <AntApp>
          <FixedComponent />
        </AntApp>
      </ConfigProvider>
    );

    await userEvent.click(screen.getByRole("button", { name: "Trigger" }));

    await waitFor(() => {
      expect(screen.getByText("Hook toast")).toBeInTheDocument();
    });
  });
});
