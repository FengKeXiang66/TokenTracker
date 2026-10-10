import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { copy, setCopyLocale } from "../../lib/copy";
import { publishCloudPromptBilling } from "../../lib/cloud-prompt-policy.js";
import { AccountSection } from "./AccountSection.jsx";

const values = vi.hoisted(() => ({ userId: "", cloudSyncOn: false, toggle: vi.fn() }));
vi.mock("./useAccountProfileSettings.js", async () => {
  const { useState } = await vi.importActual("react");
  return { useAccountProfileSettings: () => {
    const [cloudSyncOn, setCloudSyncOn] = useState(false);
    return {
  enabled: true, signedIn: true, userId: values.userId, email: "", name: {}, github: {},
  showLocalCloudSync: true, cloudSyncOn, handleCloudSyncToggle: () => {
    values.toggle();
    setCloudSyncOn((current) => !current);
  },
  publicProfileOn: false, signOut: vi.fn(), handlePublicProfileToggle: vi.fn(),
    };
  } };
});
vi.mock("../cloud/CloudMembershipCard.jsx", () => ({ CloudMembershipCard: () => null }));
let count = 0;
beforeEach(() => {
  setCopyLocale("en");
  localStorage.clear();
  values.userId = `settings-prompt-${++count}`;
  values.cloudSyncOn = false;
  values.toggle.mockReset().mockImplementation(() => { values.cloudSyncOn = !values.cloudSyncOn; });
  publishCloudPromptBilling("catalog", { environment: "live", checkout_verified: true,
    policy: { phase: "active", launch_at: "2020-01-01" }, providers: { waffo: true } }, null);
  publishCloudPromptBilling("account", { membership: { status: "free", environment: "live", phase: "active",
    trial_available: true, can_read_cloud: false, can_upload_cloud: false } }, values.userId);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("waits for the user's sync action and keeps the existing free-sync operation available", async () => {
  render(<MemoryRouter><AccountSection /></MemoryRouter>);
  const switchControl = screen.getByRole("switch", { name: copy("settings.account.cloudSync") });
  expect(switchControl.closest(".tt-cloud-sync-control")).toHaveClass("tt-cloud-theme");
  expect(screen.getByText(/Daily community uploads and leaderboard participation stay free/)).toHaveTextContent(/pause other active devices/);
  expect(screen.getByRole("switch", { name: copy("settings.account.publicProfile") }).closest(".tt-cloud-sync-control")).toBeNull();
  expect(screen.queryByRole("region", { name: "Cloud options" })).not.toBeInTheDocument();
  await act(async () => { await userEvent.click(screen.getByRole("switch", { name: copy("settings.account.cloudSync") })); });
  expect(values.toggle).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("switch", { name: copy("settings.account.publicProfile") })).toHaveAttribute("aria-checked", "false");
  expect(screen.getByRole("link", { name: "Try Cloud free" })).toBeInTheDocument();
  expect(screen.getByText(/Free community uploads continue daily/)).toBeInTheDocument();
  await act(async () => { await userEvent.click(screen.getByRole("button", { name: "Use local data" })); });
  expect(values.toggle).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("region", { name: "Cloud options" })).not.toBeInTheDocument();
});
