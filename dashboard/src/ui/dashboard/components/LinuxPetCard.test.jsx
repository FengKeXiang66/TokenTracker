import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCopyLocale } from "../../../lib/copy";
import { EN_LOCALE } from "../../../lib/locale";
import { LinuxPetCard } from "./LinuxPetCard.jsx";

const host = vi.hoisted(() => ({
  linux: true,
  bridge: true,
  posted: [],
}));

// The real usePetSettings runs; only the host side of the bridge is faked.
vi.mock("../../../lib/native-bridge.js", async (importOriginal) => ({
  ...(await importOriginal()),
  isNativeApp: () => false,
  isNativeLinuxApp: () => host.linux,
  isPetBridgeAvailable: () => host.bridge,
  requestNativePetSettings: () => host.posted.push({ type: "getPetSettings" }),
  setNativePetSetting: (key, value) => host.posted.push({ type: "setPetSetting", key, value }),
}));

function reply(settings) {
  act(() => {
    window.dispatchEvent(new CustomEvent("native:petSettings", { detail: settings }));
  });
}

vi.mock("../../foundation/ClawdAnimated.jsx", () => ({
  ClawdAnimated: () => null,
}));

vi.mock("motion/react", async () => {
  const React = await import("react");
  const motion = new Proxy({}, {
    get: (_target, tag) => React.forwardRef(function MotionElement(
      { children, initial, animate, exit, transition, whileHover, whileTap, ...props },
      ref,
    ) {
      return React.createElement(tag, { ...props, ref }, children);
    }),
  });
  return {
    AnimatePresence: ({ children }) => children,
    motion,
    useReducedMotion: () => true,
  };
});

describe("LinuxPetCard", () => {
  beforeEach(() => {
    setCopyLocale(EN_LOCALE);
    localStorage.clear();
    host.linux = true;
    host.bridge = true;
    host.posted = [];
  });

  it("offers to show the pet in the Linux app while it is off", () => {
    render(<LinuxPetCard />);
    reply({ visible: false });
    expect(screen.getByText("Meet your desktop pet")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Pet settings/ }).getAttribute("href")).toBe("/pet-settings");

    fireEvent.click(screen.getByRole("button", { name: "Show pet" }));
    expect(host.posted).toContainEqual({ type: "setPetSetting", key: "visible", value: true });
    expect(screen.queryByText("Meet your desktop pet")).toBeNull();
  });

  it("waits for the host's settings before showing", () => {
    render(<LinuxPetCard />);
    expect(host.posted).toContainEqual({ type: "getPetSettings" });
    expect(screen.queryByText("Meet your desktop pet")).toBeNull();
  });

  it("never shows when the pet is already on", () => {
    render(<LinuxPetCard />);
    expect(screen.queryByText("Meet your desktop pet")).toBeNull();
    reply({ visible: true });
    expect(screen.queryByText("Meet your desktop pet")).toBeNull();
  });

  it("never shows outside the Linux app", () => {
    host.linux = false;
    render(<LinuxPetCard />);
    reply({ visible: false });
    expect(screen.queryByText("Meet your desktop pet")).toBeNull();
  });

  it("stays hidden when the pet bridge is unavailable", () => {
    host.bridge = false;
    render(<LinuxPetCard />);
    reply({ visible: false });
    expect(screen.queryByText("Meet your desktop pet")).toBeNull();
  });

  it("dismisses permanently", () => {
    const { unmount } = render(<LinuxPetCard />);
    reply({ visible: false });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss desktop pet tip" }));
    expect(screen.queryByText("Meet your desktop pet")).toBeNull();
    unmount();
    render(<LinuxPetCard />);
    reply({ visible: false });
    expect(screen.queryByText("Meet your desktop pet")).toBeNull();
  });
});
