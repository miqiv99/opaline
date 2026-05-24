import {
  defaultSchemaForCommand,
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
  descriptionKey: string;
  category: EditorCommandDefinition["category"];
  group: EditorCommandDefinition["group"];
  parameters: JsonSchema;
  permission: EditorCommandDefinition["permission"];
  mutatesNote: boolean;
  requiresConfirmation: boolean;
  createsHistorySnapshot: boolean;
  availableForAi: boolean;
  riskLevel: EditorCommandDefinition["riskLevel"];
  experimental: boolean;
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

export type AiEditorPlanPreviewOperation = {
  commandId: string;
  known: boolean;
  labelKey?: string;
  descriptionKey?: string;
  category?: EditorCommandDefinition["category"];
  group?: EditorCommandDefinition["group"];
  mutatesNote: boolean;
  requiresConfirmation: boolean;
  createsHistorySnapshot: boolean;
  availableForAi: boolean;
  riskLevel?: EditorCommandDefinition["riskLevel"];
  experimental: boolean;
};

export type AiEditorPlanPreview = {
  summary: string;
  operationCount: number;
  operations: AiEditorPlanPreviewOperation[];
  mutatesNote: boolean;
  requiresConfirmation: boolean;
  createsHistorySnapshot: boolean;
  unknownCommandIds: string[];
  unavailableCommandIds: string[];
  experimentalCommandIds: string[];
  highRiskCommandIds: string[];
};

export type AiEditorPlanExecutionResult = {
  ok: boolean;
  executedCount: number;
  failedCommandId?: string;
  error?: string;
};

export type AiEditorPlanExecutionOptions = {
  allowConfirmedMutations?: boolean;
  createHistorySnapshot?: () => Promise<void>;
  restoreOriginalHtml?: (html: string) => void | Promise<void>;
};

export type SchemaValidationResult = {
  ok: boolean;
  errors: string[];
};

export const aiEditorToolDescriptors = (): AiEditorToolDescriptor[] =>
  editorCommandDefinitions
    .filter((command) => command.ui.ai)
    .map((command) => ({
      name: command.ai.toolName,
      commandId: command.id,
      labelKey: command.labelKey,
      descriptionKey: command.descriptionKey,
      category: command.category,
      group: command.group,
      parameters: defaultSchemaForCommand(command),
      permission: command.permission,
      mutatesNote: command.mutatesNote,
      requiresConfirmation: command.requiresConfirmation,
      createsHistorySnapshot: command.createsHistorySnapshot,
      availableForAi: command.ui.ai,
      riskLevel: command.riskLevel,
      experimental: Boolean(command.experimental),
    }));

export const previewAiEditorPlan = (plan: AiEditorOperationPlan): AiEditorPlanPreview => {
  const operations = plan.operations.map((operation): AiEditorPlanPreviewOperation => {
    const command = editorCommandById.get(operation.commandId);
    if (!command) {
      return {
        commandId: operation.commandId,
        known: false,
        mutatesNote: false,
        requiresConfirmation: false,
        createsHistorySnapshot: false,
        availableForAi: false,
        experimental: false,
      };
    }
    return {
      commandId: operation.commandId,
      known: true,
      labelKey: command.labelKey,
      descriptionKey: command.descriptionKey,
      category: command.category,
      group: command.group,
      mutatesNote: command.mutatesNote,
      requiresConfirmation: command.requiresConfirmation,
      createsHistorySnapshot: command.createsHistorySnapshot,
      availableForAi: command.ui.ai,
      riskLevel: command.riskLevel,
      experimental: Boolean(command.experimental),
    };
  });

  const unknownCommandIds = operations.filter((operation) => !operation.known).map((operation) => operation.commandId);
  const unavailableCommandIds = operations
    .filter((operation) => operation.known && !operation.availableForAi)
    .map((operation) => operation.commandId);
  const experimentalCommandIds = operations.filter((operation) => operation.experimental).map((operation) => operation.commandId);
  const highRiskCommandIds = operations.filter((operation) => operation.riskLevel === "high").map((operation) => operation.commandId);
  const mutatesNote = operations.some((operation) => operation.mutatesNote);
  const requiresConfirmation = operations.some((operation) => operation.requiresConfirmation);
  const createsHistorySnapshot = operations.some((operation) => operation.createsHistorySnapshot);
  const knownLabels = operations
    .filter((operation) => operation.known)
    .map((operation) => operation.labelKey)
    .filter(Boolean)
    .join(", ");

  return {
    summary: [
      `${plan.operations.length} operation${plan.operations.length === 1 ? "" : "s"}`,
      mutatesNote ? "mutates note" : "read-only",
      requiresConfirmation ? "requires confirmation" : "no confirmation required",
      createsHistorySnapshot ? "history snapshot requested" : "no history snapshot",
      knownLabels ? `commands: ${knownLabels}` : "commands: none",
      unknownCommandIds.length ? `unknown: ${unknownCommandIds.join(", ")}` : "",
      experimentalCommandIds.length ? `experimental: ${experimentalCommandIds.join(", ")}` : "",
    ].filter(Boolean).join("; "),
    operationCount: plan.operations.length,
    operations,
    mutatesNote,
    requiresConfirmation,
    createsHistorySnapshot,
    unknownCommandIds,
    unavailableCommandIds,
    experimentalCommandIds,
    highRiskCommandIds,
  };
};

export const executeAiEditorPlan = async (
  plan: AiEditorOperationPlan,
  context: EditorCommandContext,
  options: AiEditorPlanExecutionOptions = {},
): Promise<AiEditorPlanExecutionResult> => {
  const preview = previewAiEditorPlan(plan);
  if (preview.unknownCommandIds.length) {
    return failure(0, preview.unknownCommandIds[0], "Unknown command");
  }
  if (preview.unavailableCommandIds.length) {
    return failure(0, preview.unavailableCommandIds[0], "Command is not available to AI");
  }
  if (preview.requiresConfirmation && !options.allowConfirmedMutations) {
    return failure(0, preview.operations.find((operation) => operation.requiresConfirmation)?.commandId, "Command requires confirmation");
  }

  for (const operation of plan.operations) {
    const command = editorCommandById.get(operation.commandId);
    if (!command) return failure(0, operation.commandId, "Unknown command");
    const validation = validateJsonSchema(operation.payload ?? {}, defaultSchemaForCommand(command));
    if (!validation.ok) {
      return failure(0, operation.commandId, validation.errors.join("; "));
    }
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
        return failure(executedCount, operation.commandId, "Command could not run");
      }
      executedCount += 1;
    } catch (error) {
      await options.restoreOriginalHtml?.(originalHtml);
      return failure(executedCount, operation.commandId, error instanceof Error ? error.message : "Command failed");
    }
  }

  return { ok: true, executedCount };
};

export const validateJsonSchema = (value: unknown, schema: JsonSchema, path = "payload"): SchemaValidationResult => {
  const errors: string[] = [];
  validate(value, schema, path, errors);
  return { ok: errors.length === 0, errors };
};

export const createDemoAiEditorPlan = (): AiEditorOperationPlan => ({
  id: `demo-${Date.now()}`,
  source: "demo",
  operations: [
    { commandId: "editor.insertCallout" },
    { commandId: "editor.setParagraph" },
  ],
});

const failure = (executedCount: number, failedCommandId: string | undefined, error: string): AiEditorPlanExecutionResult => ({
  ok: false,
  executedCount,
  failedCommandId,
  error,
});

const validate = (value: unknown, schema: JsonSchema, path: string, errors: string[]) => {
  if (!matchesType(value, schema.type)) {
    errors.push(`${path} must be ${schema.type}`);
    return;
  }

  if (schema.enum && !schema.enum.some((item) => item === value)) {
    errors.push(`${path} must be one of ${schema.enum.join(", ")}`);
  }

  if (schema.type === "number" && typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) errors.push(`${path} must be >= ${schema.minimum}`);
    if (typeof schema.maximum === "number" && value > schema.maximum) errors.push(`${path} must be <= ${schema.maximum}`);
  }

  if (schema.type === "object" && isRecord(value)) {
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!(key in value)) {
        errors.push(`${path}.${key} is required`);
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (key in value) {
        validate(value[key], child, `${path}.${key}`, errors);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          errors.push(`${path}.${key} is not allowed`);
        }
      }
    }
  }

  if (schema.type === "array" && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => validate(item, schema.items as JsonSchema, `${path}[${index}]`, errors));
  }
};

const matchesType = (value: unknown, type: string) => {
  if (type === "object") return isRecord(value);
  if (type === "array") return Array.isArray(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "null") return value === null;
  return true;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
