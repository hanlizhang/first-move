import assert from "node:assert/strict";
import test from "node:test";
import { createElement, useCallback } from "react";

import { CloudRuntime, CLOUD_RUNTIME_STORAGE_KEY, useCloudRuntime, workspaceMatchesLocalCache, type CloudRuntimeDependencies } from "./cloud-runtime.ts";
import { validateCanonicalWorkspace, type CanonicalWorkspace } from "./cloud-hydration.ts";
import { createEmptyState, type AppState } from "./models.ts";
import { DAILY_PLAN_STORAGE_KEY } from "./daily-plan-state.ts";
import { STORAGE_KEY } from "./repository.ts";

const USER_ID = "90000000-0000-4000-8000-000000000001";
const DEVICE_ID = "90000000-0000-4000-8000-000000000002";

function canonicalRaw(overrides: Record<string, unknown> = {}) {
  return {
    profile: {}, settings: {}, tasks: [], task_completions: [], habits: [], habit_schedule_weekdays: [],
    habit_completions: [], activity_intents: [], activity_sessions: [], daily_plans: [], daily_plan_items: [],
    morning_checks: [], morning_attempts: [], journal_entries: [], reward_ledger: [], inventory_events: [],
    inventory_balances: [], milestone_grants: [], active_days: [], points_tenths: 0,
    ...overrides,
  };
}

function memoryStorage(state: AppState = createEmptyState()) {
  const values = new Map<string, string>([
    [STORAGE_KEY, JSON.stringify(state)],
    [DAILY_PLAN_STORAGE_KEY, "[]"],
  ]);
  return {
    values,
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  };
}

function dependencies(options: {
  storage?: ReturnType<typeof memoryStorage>;
  online?: () => boolean;
  uuid?: () => string;
  rpc?: CloudRuntimeDependencies["client"]["rpc"];
  apply?: (workspace: CanonicalWorkspace) => void;
} = {}): CloudRuntimeDependencies {
  return {
    storage: options.storage ?? memoryStorage(),
    online: options.online ?? (() => true),
    timezone: () => "Europe/Berlin",
    now: () => "2026-07-31T12:00:00.000Z",
    uuid: options.uuid ?? (() => DEVICE_ID),
    applyWorkspace: options.apply ?? (() => undefined),
    client: {
      auth: { async getSession() { return { data: { session: { access_token: "test", user: { id: USER_ID } } }, error: null }; } },
      rpc: options.rpc ?? (async (name: string) => ({
        data: name === "cloud_workspace_status" ? { initialized: true } : canonicalRaw(),
        error: null,
      })) as unknown as CloudRuntimeDependencies["client"]["rpc"],
    } as CloudRuntimeDependencies["client"],
  };
}

test("cloud-mode status persists after reload and an initialized device skips setup", async () => {
  const storage = memoryStorage();
  const first = new CloudRuntime(dependencies({ storage }));
  await first.activate(validateCanonicalWorkspace(canonicalRaw()), false);
  assert.equal(first.getSnapshot().status, "synced");
  assert.match(storage.getItem(CLOUD_RUNTIME_STORAGE_KEY) ?? "", new RegExp(USER_ID));

  const calls: string[] = [];
  const second = new CloudRuntime(dependencies({
    storage,
    rpc: (async (name: string) => {
      calls.push(name);
      return { data: canonicalRaw(), error: null };
    }) as unknown as CloudRuntimeDependencies["client"]["rpc"],
  }));
  await second.start();
  assert.deepEqual(calls, ["get_cloud_workspace_v2"]);
  assert.deepEqual(second.getSnapshot(), {
    active: true, status: "synced", lastSuccessfulSyncAt: "2026-07-31T12:00:00.000Z",
  });
});

test("a persisted cloud device buffers cache edits made while auth is restoring", async () => {
  const storage = memoryStorage();
  await new CloudRuntime(dependencies({ storage })).activate(validateCanonicalWorkspace(canonicalRaw()), false);
  let syncedTitle = "";
  const runtime = new CloudRuntime(dependencies({
    storage,
    rpc: (async (name: string, args?: Record<string, unknown>) => {
      if (name === "sync_cloud_workspace_v1") {
        syncedTitle = ((args?.p_state as AppState).tasks[0]?.title) ?? "";
        return { data: canonicalRaw({
          tasks: [{ id: "10000000-0000-4000-8000-000000000001", title: syncedTitle, direction: "Daily Life", rank: "0", created_at: "2026-07-31T08:00:00Z", updated_at: "2026-07-31T08:00:00Z" }],
        }), error: null };
      }
      return { data: canonicalRaw(), error: null };
    }) as unknown as CloudRuntimeDependencies["client"]["rpc"],
  }));
  const previous = createEmptyState();
  const next: AppState = {
    ...previous,
    tasks: [{ id: "10000000-0000-4000-8000-000000000001", title: "Before auth restored", direction: "Daily Life", order: 0, createdAt: "2026-07-31T08:00:00Z", updatedAt: "2026-07-31T08:00:00Z", completedOn: [] }],
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  runtime.queueState(previous, next, []);
  await runtime.start();
  assert.equal(syncedTitle, "Before auth restored");
  assert.equal(runtime.getSnapshot().status, "synced");
});

test("a verified matching Phase B2 cache activates without asking to load it again", async () => {
  const runtime = new CloudRuntime(dependencies());
  await runtime.start();
  assert.equal(runtime.getSnapshot().active, true);
  assert.equal(runtime.getSnapshot().status, "synced");
});

test("a new browser hydrates the canonical workspace once Use cloud progress is confirmed", async () => {
  const taskId = "10000000-0000-4000-8000-000000000001";
  const raw = canonicalRaw({
    tasks: [{ id: taskId, title: "Shared task", direction: "Daily Life", rank: "0", created_at: "2026-07-31T08:00:00Z", updated_at: "2026-07-31T08:00:00Z" }],
  });
  const workspace = validateCanonicalWorkspace(raw);
  const storage = memoryStorage();
  let hydrated: CanonicalWorkspace | undefined;
  const runtime = new CloudRuntime(dependencies({ storage, apply: (value) => { hydrated = value; } }));
  await runtime.activate(workspace, true);
  assert.equal(hydrated?.state.tasks[0].title, "Shared task");
  assert.equal(runtime.getSnapshot().status, "synced");
});

test("client A creates a task and client B receives it on refresh", async () => {
  const taskId = "10000000-0000-4000-8000-000000000001";
  let serverWorkspace = canonicalRaw();
  const rpc = (async (name: string, args?: Record<string, unknown>) => {
    if (name === "sync_cloud_workspace_v1") {
      const state = args?.p_state as AppState;
      serverWorkspace = canonicalRaw({
        tasks: state.tasks.map((task) => ({
          id: task.id, title: task.title, direction: task.direction, rank: String(task.order),
          created_at: task.createdAt, updated_at: task.updatedAt,
        })),
      });
    }
    return { data: name === "cloud_workspace_status" ? { initialized: true } : serverWorkspace, error: null };
  }) as unknown as CloudRuntimeDependencies["client"]["rpc"];
  const storageA = memoryStorage();
  const storageB = memoryStorage();
  const runtimeA = new CloudRuntime(dependencies({ storage: storageA, rpc, uuid: (() => {
    const values = ["91000000-0000-4000-8000-000000000001", "91000000-0000-4000-8000-000000000002"];
    return () => values.shift() ?? crypto.randomUUID();
  })() }));
  let clientBWorkspace: CanonicalWorkspace | undefined;
  const runtimeB = new CloudRuntime(dependencies({
    storage: storageB, rpc, uuid: () => "92000000-0000-4000-8000-000000000001",
    apply: (workspace) => { clientBWorkspace = workspace; },
  }));
  const empty = validateCanonicalWorkspace(serverWorkspace);
  await runtimeA.activate(empty, false);
  await runtimeB.activate(empty, false);
  const previous = createEmptyState();
  const next: AppState = {
    ...previous,
    tasks: [{ id: taskId, title: "From client A", direction: "Daily Life", order: 0, createdAt: "2026-07-31T08:00:00Z", updatedAt: "2026-07-31T08:00:00Z", completedOn: [] }],
  };
  storageA.setItem(STORAGE_KEY, JSON.stringify(next));
  runtimeA.queueState(previous, next, []);
  await runtimeA.refresh();
  await runtimeB.refresh();
  assert.equal(clientBWorkspace?.state.tasks[0].title, "From client A");
});

test("network failure preserves the local cache and retry clears the error", async () => {
  const storage = memoryStorage();
  let fail = true;
  const rpc = (async (name: string) => {
    if (name === "sync_cloud_workspace_v1" && fail) return { data: null, error: { message: "offline" } };
    return { data: canonicalRaw({
      tasks: [{ id: "10000000-0000-4000-8000-000000000001", title: "Cached task", direction: "Daily Life", rank: "0", created_at: "2026-07-31T08:00:00Z", updated_at: "2026-07-31T08:00:00Z" }],
    }), error: null };
  }) as unknown as CloudRuntimeDependencies["client"]["rpc"];
  const runtime = new CloudRuntime(dependencies({ storage, rpc }));
  await runtime.activate(validateCanonicalWorkspace(canonicalRaw()), false);
  const previous = createEmptyState();
  const next: AppState = {
    ...previous,
    tasks: [{ id: "10000000-0000-4000-8000-000000000001", title: "Cached task", direction: "Daily Life", order: 0, createdAt: "2026-07-31T08:00:00Z", updatedAt: "2026-07-31T08:00:00Z", completedOn: [] }],
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  runtime.queueState(previous, next, []);
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().status, "error");
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}").tasks[0].title, "Cached task");
  const failedMeta = JSON.parse(storage.getItem(CLOUD_RUNTIME_STORAGE_KEY) ?? "{}") as { accounts: Record<string, { pending: unknown[] }> };
  assert.equal(failedMeta.accounts[USER_ID].pending.length, 1);

  fail = false;
  await runtime.retry();
  assert.equal(runtime.getSnapshot().status, "synced");
  const meta = JSON.parse(storage.getItem(CLOUD_RUNTIME_STORAGE_KEY) ?? "{}") as { accounts: Record<string, { pending: unknown[] }> };
  assert.equal(meta.accounts[USER_ID].pending.length, 0);
});

test("header can claim Synced only after an activation or successful cloud operation", async () => {
  const runtime = new CloudRuntime(dependencies());
  assert.equal(runtime.getSnapshot().status, "not-initialized");
  await runtime.activate(validateCanonicalWorkspace(canonicalRaw()), false);
  assert.equal(runtime.getSnapshot().status, "synced");
});

test("workspace equality protects a different device's guest cache from automatic replacement", () => {
  const state = createEmptyState();
  state.tasks = [{ id: "10000000-0000-4000-8000-000000000001", title: "Guest only", direction: "Rest", order: 0, createdAt: "2026-07-31T08:00:00Z", updatedAt: "2026-07-31T08:00:00Z", completedOn: [] }];
  assert.equal(workspaceMatchesLocalCache(memoryStorage(state), validateCanonicalWorkspace(canonicalRaw())), false);
});

test("cloud runtime keeps effect dependency shape stable across feature and auth rerenders", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousActEnvironment = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  const browser = fakeBrowser();
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser.window });
  Object.defineProperty(globalThis, "document", { configurable: true, value: browser.document });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  const messages: string[] = [];
  const originalError = console.error;
  console.error = (...values: unknown[]) => { messages.push(values.map(String).join(" ")); };
  try {
    const [{ createRoot }, { act }] = await Promise.all([import("react-dom/client"), import("react")]);
    const root = createRoot(browser.container as unknown as Element);
    function Harness({ email, enabled }: { email: string | null; enabled: boolean }) {
      const acceptWorkspace = useCallback(() => undefined, []);
      useCloudRuntime(email, acceptWorkspace, enabled);
      return null;
    }
    await act(async () => { root.render(createElement(Harness, { email: null, enabled: false })); });
    await act(async () => { root.render(createElement(Harness, { email: null, enabled: true })); });
    await act(async () => { root.render(createElement(Harness, { email: "restored@example.test", enabled: false })); });
    await act(async () => { root.unmount(); });
  } finally {
    console.error = originalError;
    restoreGlobal("window", previousWindow);
    restoreGlobal("document", previousDocument);
    restoreGlobal("IS_REACT_ACT_ENVIRONMENT", previousActEnvironment);
  }
  assert.equal(messages.some((message) => /final argument passed to useEffect changed size between renders/i.test(message)), false);
});

function fakeBrowser() {
  class EventTargetLike {
    addEventListener() {}
    removeEventListener() {}
  }
  class ElementLike extends EventTargetLike {
    nodeType = 1;
    nodeName: string;
    tagName: string;
    namespaceURI = "http://www.w3.org/1999/xhtml";
    ownerDocument!: DocumentLike;
    parentNode: ElementLike | null = null;
    childNodes: ElementLike[] = [];
    style: Record<string, string> = {};
    private attributes = new Map<string, string>();
    constructor(tagName: string) { super(); this.nodeName = tagName.toUpperCase(); this.tagName = this.nodeName; }
    appendChild(child: ElementLike) { child.parentNode = this; this.childNodes.push(child); return child; }
    insertBefore(child: ElementLike, before: ElementLike | null) {
      child.parentNode = this;
      const index = before ? this.childNodes.indexOf(before) : -1;
      if (index < 0) this.childNodes.push(child); else this.childNodes.splice(index, 0, child);
      return child;
    }
    removeChild(child: ElementLike) { this.childNodes = this.childNodes.filter((candidate) => candidate !== child); child.parentNode = null; return child; }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    removeAttribute(name: string) { this.attributes.delete(name); }
    hasAttribute(name: string) { return this.attributes.has(name); }
    get firstChild(): ElementLike | null { return this.childNodes[0] ?? null; }
    get lastChild(): ElementLike | null { return this.childNodes.at(-1) ?? null; }
    set textContent(_value: string) { this.childNodes = []; }
  }
  class DocumentLike extends EventTargetLike {
    nodeType = 9;
    nodeName = "#document";
    documentElement: ElementLike;
    body: ElementLike;
    defaultView: unknown;
    activeElement: ElementLike | null = null;
    constructor() {
      super();
      this.documentElement = new ElementLike("html");
      this.body = new ElementLike("body");
      this.documentElement.ownerDocument = this;
      this.body.ownerDocument = this;
    }
    createElement(tagName: string) { const element = new ElementLike(tagName); element.ownerDocument = this; return element; }
    createElementNS(_namespace: string, tagName: string) { return this.createElement(tagName); }
    createTextNode() { const node = new ElementLike("#text"); node.nodeType = 3; return node; }
  }
  const document = new DocumentLike();
  class HTMLElementLike {}
  class HTMLIFrameElementLike extends HTMLElementLike {}
  const window = new EventTargetLike() as EventTargetLike & Record<string, unknown>;
  Object.assign(window, { document, HTMLElement: HTMLElementLike, HTMLIFrameElement: HTMLIFrameElementLike, Node: ElementLike, event: undefined });
  document.defaultView = window;
  const container = document.createElement("div");
  return { window, document, container };
}

function restoreGlobal(name: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}
