import { demoWorkspaceAdapter } from "./demoWorkspaceAdapter";
import { tauriWorkspaceAdapter } from "./tauriWorkspaceAdapter";
import type { WorkspaceAdapter } from "./workspaceAdapter";

const isTauri = "__TAURI_INTERNALS__" in window;

export const workspaceAdapter: WorkspaceAdapter = isTauri
  ? tauriWorkspaceAdapter
  : demoWorkspaceAdapter;
