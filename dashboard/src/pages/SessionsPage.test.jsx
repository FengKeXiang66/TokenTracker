import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSessions } from "../lib/sessions-api";
import { SessionsPage } from "./SessionsPage.jsx";

vi.mock("../lib/sessions-api", () => ({
  getSessions: vi.fn(),
}));

vi.mock("../lib/mock-data", () => ({
  isMockEnabled: () => true,
}));

vi.mock("../ui/components/Toast.jsx", () => ({
  showToast: vi.fn(),
}));

vi.mock("../hooks/useLocale", () => ({
  useLocale: () => ({ resolvedLocale: "en" }),
}));

const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

const response = {
  from: "",
  to: "",
  available: true,
  session_count: 3,
  returned_count: 3,
  sessions: [
    {
      session_hash: "claude-row",
      session_id: "11111111-2222-3333-4444-555555555555",
      title: "Fix authentication flow",
      source: "claude",
      project_key: "tokentracker",
      project_ref: "/work/tokentracker",
      model: "claude-opus-4-8",
      started_at: "2026-07-24T08:00:00Z",
      ended_at: "2026-07-24T08:10:00Z",
      duration_ms: 600_000,
      turns: 1,
      edit_turns: 1,
      retry_turns: 0,
      subagent_calls: 0,
      total_tokens: 12_000,
      cost_usd: 0.25,
      productive: true,
      first_pass: true,
      resume_command: "claude --resume 11111111-2222-3333-4444-555555555555",
    },
    {
      session_hash: "codex-row",
      session_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      title: "Review release",
      source: "codex",
      project_key: "lumaradio",
      project_ref: "/work/lumaradio",
      model: "gpt-5.6-sol",
      started_at: "2026-07-23T08:00:00Z",
      ended_at: "2026-07-23T08:20:00Z",
      duration_ms: 1_200_000,
      turns: 2,
      edit_turns: 0,
      retry_turns: 0,
      subagent_calls: 0,
      total_tokens: 8_000,
      cost_usd: 0.1,
      productive: false,
      first_pass: false,
      resume_command: "codex resume aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    },
    {
      session_hash: "grok-row",
      session_id: "019f740c-e792-7fb1-a218-59ea1b340714",
      title: "Debug local proxy",
      source: "grok",
      project_key: "alphafox-web",
      project_ref: "/work/alphafox-web",
      model: "grok-4.6",
      started_at: "2026-07-22T08:00:00Z",
      ended_at: "2026-07-22T08:15:00Z",
      duration_ms: 900_000,
      turns: 3,
      edit_turns: 1,
      retry_turns: 0,
      subagent_calls: 0,
      input_tokens: 8_586,
      cached_input_tokens: 192_896,
      cache_creation_input_tokens: 0,
      output_tokens: 1_391,
      reasoning_output_tokens: 1_420,
      total_tokens: 204_293,
      cost_usd: 0.130486,
      cost_source: "provider_reported",
      usage_precision: "reported",
      usage_is_incomplete: false,
      cost_is_partial: false,
      usage_events: 2,
      model_calls: 7,
      api_duration_ms: 55_909,
      context_tokens_used: 31_445,
      context_window_tokens: 500_000,
      context_usage_percent: 6,
      tool_calls: 5,
      tool_failures: 0,
      error_count: 1,
      compaction_count: 0,
      productive: true,
      first_pass: true,
      resume_command: "grok --resume 019f740c-e792-7fb1-a218-59ea1b340714",
    },
  ],
};

const makeThreadSession = (overrides) => ({
  ...response.sessions[1],
  session_hash: "thread-row",
  session_id: "00000000-0000-4000-8000-000000000000",
  title: "Thread session",
  source: "codex",
  project_key: "thread-fixture",
  project_ref: "/work/thread-fixture",
  model: "gpt-5.6-sol",
  parent_session_id: null,
  parent_session_hash: null,
  root_session_hash: "thread-row",
  thread_kind: "root",
  agent_nickname: null,
  agent_role: null,
  orphaned_subagent: false,
  parent_link_conflict: false,
  direct_subagent_count: 0,
  descendant_subagent_count: 0,
  own_total_tokens: 1_000,
  subagent_total_tokens: 0,
  combined_total_tokens: 1_000,
  total_tokens: 1_000,
  own_cost_usd: 0.01,
  subagent_cost_usd: 0,
  combined_cost_usd: 0.01,
  cost_usd: 0.01,
  ...overrides,
});

describe("SessionsPage", () => {
  beforeEach(() => {
    getSessions.mockReset();
    getSessions.mockResolvedValue(response);
    window.localStorage.clear();
  });

  it("loads local sessions and filters them by source and search", async () => {
    render(<SessionsPage />);

    expect(await screen.findByText("Fix authentication flow")).toBeInTheDocument();
    expect(screen.getByText("Review release")).toBeInTheDocument();
    expect(screen.getByText("Debug local proxy")).toBeInTheDocument();
    expect(screen.getByText("Reported cost")).toBeInTheDocument();
    expect(screen.getByText("Input 8.6K · Cache read 192.9K · Cache write 0 · Output 1.4K · Reasoning 1.4K")).toBeInTheDocument();
    expect(screen.getByText("Model calls 7 · API 55.9s · Tools 5 · Errors 1")).toBeInTheDocument();
    expect(screen.getByText("Context 31.4K / 500K (6%)")).toBeInTheDocument();
    // The whole list is fetched once; no row cap and no server-side window.
    expect(getSessions).toHaveBeenCalledWith({ refresh: false });

    const sourceTabs = within(screen.getByRole("tablist", { name: "Filter by session source" }));
    fireEvent.click(sourceTabs.getByRole("tab", { name: "Codex" }));
    expect(screen.queryByText("Fix authentication flow")).not.toBeInTheDocument();
    expect(screen.getByText("Review release")).toBeInTheDocument();
    expect(screen.queryByText("Debug local proxy")).not.toBeInTheDocument();

    fireEvent.click(sourceTabs.getByRole("tab", { name: "Grok" }));
    expect(screen.queryByText("Review release")).not.toBeInTheDocument();
    expect(screen.getByText("Debug local proxy")).toBeInTheDocument();

    fireEvent.click(sourceTabs.getByRole("tab", { name: "All" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search sessions" }), {
      target: { value: "auth" },
    });
    expect(screen.getByText("Fix authentication flow")).toBeInTheDocument();
    expect(screen.queryByText("Review release")).not.toBeInTheDocument();
    expect(screen.queryByText("Debug local proxy")).not.toBeInTheDocument();
  });

  it("renders and searches every observed model in a mixed Codex session", async () => {
    const mixed = {
      ...response.sessions[1],
      session_hash: "mixed-codex-row",
      title: "Mixed model work",
      model: "mixed",
      own_total_tokens: 8_000,
      cost_usd: 0.1,
      cost_is_partial: true,
      model_usage: [
        { model: "gpt-5.6-sol", total_tokens: 6_000 },
        { model: "gpt-5.6-terra", total_tokens: 2_000 },
      ],
    };
    getSessions.mockResolvedValue({
      ...response,
      session_count: 1,
      returned_count: 1,
      sessions: [mixed],
    });

    render(<SessionsPage />);
    expect(await screen.findByText("Mixed model work")).toBeInTheDocument();
    expect(screen.getByText(/gpt-5\.6-sol 6K.*gpt-5\.6-terra 2K/)).toBeInTheDocument();
    // A Codex session priced from an unrated model must explain itself: the
    // marker alone used to be the only signal and carried no label at all.
    const partialCost = screen.getByText(/^≥\$/);
    expect(partialCost).toBeInTheDocument();
    expect(partialCost).toHaveAttribute("title", expect.stringContaining("Lower bound"));
    expect(screen.getByText("Partial cost")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search sessions" }), {
      target: { value: "terra" },
    });
    expect(screen.getByText("Mixed model work")).toBeInTheDocument();
  });

  it("folds direct and nested subagents under their root session", async () => {
    const root = makeThreadSession({
      session_hash: "root-hash",
      session_id: "10000000-0000-4000-8000-000000000000",
      root_session_hash: "root-hash",
      title: "Root session",
      direct_subagent_count: 1,
      descendant_subagent_count: 2,
      subagent_total_tokens: 500,
      combined_total_tokens: 1_500,
    });
    const child = makeThreadSession({
      session_hash: "child-hash",
      session_id: "20000000-0000-4000-8000-000000000000",
      parent_session_id: root.session_id,
      parent_session_hash: root.session_hash,
      root_session_hash: root.session_hash,
      thread_kind: "subagent",
      agent_nickname: "Direct child",
      agent_role: "luna",
      model: "gpt-5.6-luna",
      own_total_tokens: 300,
      total_tokens: 300,
      combined_total_tokens: 300,
    });
    const grandchild = makeThreadSession({
      session_hash: "grandchild-hash",
      session_id: "30000000-0000-4000-8000-000000000000",
      parent_session_id: child.session_id,
      parent_session_hash: child.session_hash,
      root_session_hash: root.session_hash,
      thread_kind: "subagent",
      agent_nickname: "Grandchild agent",
      agent_role: "spark",
      model: "gpt-5.3-codex-spark",
      own_total_tokens: 200,
      total_tokens: 200,
      combined_total_tokens: 200,
    });
    getSessions.mockResolvedValue({
      ...response,
      session_count: 3,
      returned_count: 3,
      sessions: [root, child, grandchild],
    });

    render(<SessionsPage />);

    expect(await screen.findByText("Root session")).toBeInTheDocument();
    expect(screen.queryByText("Direct child")).not.toBeInTheDocument();
    expect(screen.queryByText("Grandchild agent")).not.toBeInTheDocument();
    expect(screen.getByText(/1 root sessions.*2 subagents collapsed/)).toBeInTheDocument();

    const expand = screen.getByRole("button", { name: "Expand 2 subagents" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expand);

    expect(screen.getByRole("button", { name: "Collapse 2 subagents" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Subagent model usage")).toBeInTheDocument();
    expect(screen.getByText("Direct child")).toBeInTheDocument();
    expect(screen.getByText("Grandchild agent")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse 2 subagents" }));
    expect(screen.queryByText("Direct child")).not.toBeInTheDocument();
    expect(screen.queryByText("Grandchild agent")).not.toBeInTheDocument();
  });

  it("filters subagents by model within only the selected root", async () => {
    const rootA = makeThreadSession({
      session_hash: "root-a",
      session_id: "40000000-0000-4000-8000-000000000000",
      root_session_hash: "root-a",
      title: "Root A",
    });
    const rootB = makeThreadSession({
      session_hash: "root-b",
      session_id: "50000000-0000-4000-8000-000000000000",
      root_session_hash: "root-b",
      title: "Root B",
    });
    const child = (overrides) => makeThreadSession({
      thread_kind: "subagent",
      title: null,
      ...overrides,
    });
    getSessions.mockResolvedValue({
      ...response,
      session_count: 5,
      returned_count: 5,
      sessions: [
        rootA,
        child({
          session_hash: "root-a-sol",
          session_id: "60000000-0000-4000-8000-000000000000",
          parent_session_id: rootA.session_id,
          parent_session_hash: rootA.session_hash,
          root_session_hash: rootA.session_hash,
          agent_nickname: "A keep",
          agent_role: "sol",
          model: "gpt-5.6-sol",
          own_total_tokens: 300,
          total_tokens: 300,
        }),
        child({
          session_hash: "root-a-luna",
          session_id: "70000000-0000-4000-8000-000000000000",
          parent_session_id: rootA.session_id,
          parent_session_hash: rootA.session_hash,
          root_session_hash: rootA.session_hash,
          agent_nickname: "A hide",
          agent_role: "luna",
          model: "gpt-5.6-luna",
          own_total_tokens: 200,
          total_tokens: 200,
        }),
        rootB,
        child({
          session_hash: "root-b-spark",
          session_id: "80000000-0000-4000-8000-000000000000",
          parent_session_id: rootB.session_id,
          parent_session_hash: rootB.session_hash,
          root_session_hash: rootB.session_hash,
          agent_nickname: "B child",
          agent_role: "spark",
          model: "gpt-5.3-codex-spark",
          own_total_tokens: 100,
          total_tokens: 100,
        }),
      ],
    });

    render(<SessionsPage />);
    expect(await screen.findByText("Root A")).toBeInTheDocument();
    expect(screen.getByText("Root B")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand 2 subagents" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand 1 subagents" }));
    expect(screen.getByText("A keep")).toBeInTheDocument();
    expect(screen.getByText("A hide")).toBeInTheDocument();
    expect(screen.getByText("B child")).toBeInTheDocument();

    const solFilter = screen.getByRole("button", { name: /gpt-5\.6-sol/ });
    fireEvent.click(solFilter);
    expect(solFilter).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("A keep")).toBeInTheDocument();
    expect(screen.queryByText("A hide")).not.toBeInTheDocument();
    expect(screen.getByText("B child")).toBeInTheDocument();
  });

  it("keeps a matching child visible when its root is filtered out", async () => {
    const root = makeThreadSession({
      session_hash: "filtered-root",
      session_id: "90000000-0000-4000-8000-000000000000",
      root_session_hash: "filtered-root",
      title: "Root hidden by search",
    });
    const child = makeThreadSession({
      session_hash: "filtered-child",
      session_id: "a0000000-0000-4000-8000-000000000000",
      title: null,
      parent_session_id: root.session_id,
      parent_session_hash: root.session_hash,
      root_session_hash: root.session_hash,
      thread_kind: "subagent",
      agent_nickname: "Visible child only",
      agent_role: "luna",
      model: "gpt-5.6-luna",
    });
    getSessions.mockResolvedValue({
      ...response,
      session_count: 2,
      returned_count: 2,
      sessions: [root, child],
    });

    render(<SessionsPage />);
    expect(await screen.findByText("Root hidden by search")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search sessions" }), {
      target: { value: "Visible child only" },
    });

    await waitFor(() => {
      expect(screen.getByText("Visible child only")).toBeInTheDocument();
      expect(screen.queryByText("Root hidden by search")).not.toBeInTheDocument();
    });
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Expand .* subagents/ })).not.toBeInTheDocument();
  });

  it("filters the date range client-side without re-querying", async () => {
    getSessions.mockResolvedValue({
      ...response,
      session_count: 3,
      returned_count: 3,
      sessions: [
        { ...response.sessions[0], started_at: daysAgo(1), ended_at: daysAgo(1) },
        // Started well before a 7d window but ran into it: must stay visible.
        // Filtering on started_at alone used to drop exactly these.
        {
          ...response.sessions[1],
          session_hash: "spanning-row",
          title: "Long running migration",
          started_at: daysAgo(40),
          ended_at: daysAgo(2),
        },
        {
          ...response.sessions[1],
          session_hash: "old-row",
          title: "Ancient session",
          started_at: daysAgo(60),
          ended_at: daysAgo(59),
        },
      ],
    });

    render(<SessionsPage />);
    await screen.findByText("Ancient session");
    expect(getSessions).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("tab", { name: "7d" }));

    expect(screen.getByText("Fix authentication flow")).toBeInTheDocument();
    expect(screen.getByText("Long running migration")).toBeInTheDocument();
    expect(screen.queryByText("Ancient session")).not.toBeInTheDocument();
    // Range chips filter what is already loaded — no extra round trip.
    expect(getSessions).toHaveBeenCalledTimes(1);
  });

  it("copies the project path from the project label", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<SessionsPage />);
    await screen.findByText("Fix authentication flow");

    // Titled rows expose the path on the project chip; untitled rows put it on
    // the heading (which is the project name). Both must reach the same path.
    fireEvent.click(screen.getByRole("button", { name: "Copy the local path for tokentracker" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("/work/tokentracker"));

    // The tooltip carries the full path plus the click-to-copy hint.
    expect(screen.getAllByRole("tooltip")[0]).toHaveTextContent("/work/tokentracker");
    expect(screen.getAllByRole("tooltip")[0]).toHaveTextContent("Click to copy this path");
  });

  it("reports a truncated list instead of silently dropping sessions", async () => {
    getSessions.mockResolvedValue({ ...response, session_count: 1297, returned_count: 2 });
    render(<SessionsPage />);
    expect(await screen.findByText(/1297/)).toBeInTheDocument();
  });

  it("shows a retryable error instead of the empty state when loading fails", async () => {
    getSessions.mockRejectedValueOnce(new Error("boom"));
    render(<SessionsPage />);

    expect(await screen.findByText("Could not load sessions")).toBeInTheDocument();
    expect(screen.queryByText("No sessions yet")).not.toBeInTheDocument();

    getSessions.mockResolvedValue(response);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Fix authentication flow")).toBeInTheDocument();
  });

  it("renders a bounded window of rows and extends it on demand", async () => {
    const many = Array.from({ length: 150 }, (_, index) => ({
      ...response.sessions[0],
      session_hash: `row-${index}`,
      title: `Session ${index}`,
    }));
    getSessions.mockResolvedValue({
      ...response,
      session_count: many.length,
      returned_count: many.length,
      sessions: many,
    });

    render(<SessionsPage />);
    await screen.findByText("Session 0");
    expect(screen.getByText("Session 99")).toBeInTheDocument();
    expect(screen.queryByText("Session 100")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show more sessions" }));
    expect(await screen.findByText("Session 149")).toBeInTheDocument();
  });
});
