import {
  editorCommandById,
  editorCommandDefinitions,
  runEditorCommand,
  type EditorCommandContext,
  type EditorCommandDefinition,
  type JsonSchema,
} from "./editorCommands";

export type AiEditorToolDescriptor = {
  name: string;
  commandId: string;
  labelKey: string;
  category: EditorCommandDefinition["category"];
  parameters: JsonSchema;
  permission: EditorCommandDefinition["ai"]["permission"];
  mutatesNote: boolean;
  requiresConfirmation: boolean;
  createsHistorySnapshot: boolean;
};

export type AiEditorOperation = {
  commandId: string;
  payload?: unknown;
};

export type AiEditorOperationPlan = {
  id: string;
  source: "ai" | "demo" | "test";
  operations: AiEditorOperation[];
};

export type AiEditorPlanPreview = {
  summary: string;
  operationCount: number;
  mutatesNote: boolean;
  requiresConfirmation: boolean;
  createsHistorySnapshot: boolean;
  unknownCommandIds: string[];
};

export type AiEditorPlanExecutionResult = {
  ok: boolean;
  executedCount: number;
  failedCommandId?: string;
  error?: string;
};

export type AiEditorPlanExecutionOptions = {
  createHistorySnapshot?: () => Promise<void>;
  restoreOriginalHtml?: (html: string) => void | Promise<void>;
};

export const aiEditorToolDescriptors = (): AiEditorToolDescriptor[] =>
  editorCommandDefinitions.map((command) => ({
    name: command.ai.toolName,
    commandId: command.id,
    labelKey: command.labelKey,
    category: command.category,
    parameters: command.payloadSchema ?? { type: "object", properties: {}, additionalProperties: false },
    permission: command.ai.permission,
    mutatesNote: command.ai.mutatesNote,
    requiresConfirmation: command.ai.requiresConfirmation,
    createsHistorySnapshot: command.ai.createsHistorySnapshot,
  }));

export const previewAiEditorPlan = (plan: AiEditorOperationPlan): AiEditorPlanPreview => {
  const commands = plan.operations.map((operation) => editorCommandById.get(operation.commandId));
  const knownCommands = commands.filter((command): command is EditorCommandDefinition => Boolean(command));
  const unknownCommandIds = plan.operations
    .filter((operation) => !editorCommandById.has(operation.commandId))
    .map((operation) => operation.commandId);
  const mutatesNote = knownCommands.some((command) => command.ai.mutatesNote);
  const requiresConfirmation = knownCommands.some((command) => command.ai.requiresConfirmation);
  const createsHistorySnapshot = knownCommands.some((command) => command.ai.createsHistorySnapshot);
  const labels = knownCommands.map((command) => command.labelKey).join(", ");

  return {
    summary: labels ? `commands: ${labels}` : "commands: none",
    operationCount: plan.operations.length,
    mutatesNote,
    requiresConfirmation,
    createsHistorySnapshot,
    unknownCommandIds,
  };
};

export const executeAiEditorPlan = async (
  plan: AiEditorOperationPlan,
  context: EditorCommandContext,
  options: AiEditorPlanExecutionOptions = {},
): Promise<AiEditorPlanExecutionResult> => {
  const preview = previewAiEditorPlan(plan);
  if (preview.unknownCommandIds.length) {
    return {
      ok: false,
      executedCount: 0,
      failedCommandId: preview.unknownCommandIds[0],
      error: "Unknown command",
    };
  }

  const originalHtml = context.editor.getHTML();
  if (preview.createsHistorySnapshot) {
    await options.createHistorySnapshot?.();
  }

  let executedCount = 0;
  for (const operation of plan.operations) {
    try {
      const ok = await runEditorCommand(operation.commandId, context, operation.payload);
      if (!ok) {
        await options.restoreOriginalHtml?.(originalHtml);
        return {
          ok: false,
          executedCount,
          failedCommandId: operation.commandId,
          error: "Command could not run",
        };
      }
      executedCount += 1;
    } catch (error) {
      await options.restoreOriginalHtml?.(originalHtml);
      return {
        ok: false,
        executedCount,
        failedCommandId: operation.commandId,
        error: error instanceof Error ? error.message : "Command failed",
      };
    }
  }

  return { ok: true, executedCount };
};

export const createDemoAiEditorPlan = (): AiEditorOperationPlan => ({
  id: `demo-${Date.now()}`,
  source: "demo",
  operations: [
    { commandId: "editor.insertCallout" },
    { commandId: "editor.setParagraph" },
  ],
});
