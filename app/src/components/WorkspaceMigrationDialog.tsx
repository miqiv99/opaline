import { useEffect, useState } from "react";
import type { WorkspaceMigrationPreview, WorkspaceMigrationResult, WorkspaceOperationMessage } from "../domain/note";
import { useI18n } from "../i18n";

interface WorkspaceMigrationDialogProps {
  open: boolean;
  oldPath: string;
  newPath: string;
  onPreview: (source: string, destination: string) => Promise<WorkspaceMigrationPreview>;
  onMigrate: (source: string, destination: string) => Promise<WorkspaceMigrationResult>;
  onSuccess: (result: WorkspaceMigrationResult) => Promise<void> | void;
  onCancel: () => void;
}

type MigrationPhase = "previewing" | "confirm" | "migrating" | "done" | "error";

export function WorkspaceMigrationDialog({
  open,
  oldPath,
  newPath,
  onPreview,
  onMigrate,
  onSuccess,
  onCancel,
}: WorkspaceMigrationDialogProps) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<MigrationPhase>("previewing");
  const [preview, setPreview] = useState<WorkspaceMigrationPreview | null>(null);
  const [result, setResult] = useState<WorkspaceMigrationResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !oldPath || !newPath) return;
    let ignore = false;
    setPhase("previewing");
    setPreview(null);
    setResult(null);
    setError("");
    onPreview(oldPath, newPath)
      .then((nextPreview) => {
        if (ignore) return;
        setPreview(nextPreview);
        setPhase("confirm");
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : t("migration.errorFallback"));
        setPhase("error");
      });
    return () => {
      ignore = true;
    };
  }, [newPath, oldPath, onPreview, open, t]);

  if (!open) return null;

  const runMigration = async () => {
    setPhase("migrating");
    setError("");
    try {
      const nextResult = await onMigrate(oldPath, newPath);
      setResult(nextResult);
      await onSuccess(nextResult);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("migration.errorFallback"));
      setPhase("error");
    }
  };

  const close = () => {
    setPhase("previewing");
    setPreview(null);
    setResult(null);
    setError("");
    onCancel();
  };

  const canClose = phase !== "previewing" && phase !== "migrating";

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={canClose ? close : undefined}>
      <section
        className="note-dialog migration-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="migration-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {phase === "previewing" ? (
          <>
            <div className="note-dialog-header">
              <h2 id="migration-title">{t("migration.previewingTitle")}</h2>
              <p>{t("migration.previewingDesc")}</p>
            </div>
            <p className="migration-status">
              <span className="spinner" />
              {t("migration.previewing")}
            </p>
          </>
        ) : phase === "confirm" && preview ? (
          <>
            <div className="note-dialog-header">
              <h2 id="migration-title">{t("migration.title")}</h2>
              <p>{t("migration.description")}</p>
            </div>
            <div className="migration-paths">
              <PathRow label={t("migration.current")} value={preview.sourcePath} />
              <PathRow label={t("migration.newLocation")} value={preview.targetPath} />
            </div>
            <div className="operation-summary-grid">
              <Metric label={t("migration.fileCount")} value={String(preview.fileCount)} />
              <Metric label={t("migration.totalSize")} value={formatBytes(preview.totalBytes)} />
              <Metric label={t("migration.targetExists")} value={preview.targetExists ? t("common.yes") : t("common.no")} />
              <Metric label={t("migration.conflicts")} value={String(preview.conflictCount)} />
            </div>
            <div className="operation-safety-note">
              <span>{t("migration.copySafety")}</span>
            </div>
            <OperationMessages messages={preview.errors} kind="error" prefix="migration.error" />
            <OperationMessages messages={preview.warnings} kind="warning" prefix="migration.warning" />
            <OperationMessages messages={preview.conflicts} kind="error" prefix="migration.error" />
            <div className="dialog-actions">
              <button type="button" className="dialog-secondary" onClick={close}>
                {t("action.cancel")}
              </button>
              <button type="button" className="dialog-primary" onClick={() => void runMigration()} disabled={!preview.ready}>
                {t("migration.confirmCopy")}
              </button>
            </div>
          </>
        ) : phase === "migrating" ? (
          <>
            <div className="note-dialog-header">
              <h2>{t("migration.runningTitle")}</h2>
              <p>{t("migration.runningDesc")}</p>
            </div>
            <p className="migration-status">
              <span className="spinner" />
              {t("migration.running")}
            </p>
          </>
        ) : phase === "done" && result ? (
          <>
            <div className="note-dialog-header">
              <h2>{t("migration.doneTitle")}</h2>
              <p>{t("migration.doneDesc")}</p>
            </div>
            <div className="migration-paths">
              <PathRow label={t("migration.newLocation")} value={result.workspacePath} />
              <PathRow label={t("migration.oldLocation")} value={result.sourcePath} />
            </div>
            <div className="operation-summary-grid">
              <Metric label={t("migration.fileCount")} value={String(result.fileCount)} />
              <Metric label={t("migration.totalSize")} value={formatBytes(result.totalBytes)} />
              <Metric label={t("migration.elapsed")} value={t("migration.elapsedMs", { ms: result.elapsedMs })} />
              <Metric label={t("migration.verified")} value={migrationVerifiedLabel(result, t)} />
            </div>
            <div className="operation-safety-note">
              <span>{t("migration.sourceKept")}</span>
            </div>
            <OperationMessages messages={result.warnings} kind="warning" prefix="migration.warning" />
            <div className="dialog-actions">
              <button type="button" className="dialog-primary" onClick={close}>
                {t("action.confirm")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="note-dialog-header">
              <h2>{t("migration.errorTitle")}</h2>
              <p>{error}</p>
            </div>
            <div className="dialog-actions">
              <button type="button" className="dialog-secondary" onClick={close}>
                {t("action.close")}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="migration-path-row">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="operation-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OperationMessages({
  messages,
  kind,
  prefix,
}: {
  messages: WorkspaceOperationMessage[];
  kind: "error" | "warning";
  prefix: string;
}) {
  const { t } = useI18n();
  if (!messages.length) return null;
  return (
    <div className={`operation-message-list is-${kind}`}>
      {messages.map((message, index) => {
        const key = `${prefix}.${message.code}`;
        const translated = t(key);
        return (
          <p key={`${message.code}-${message.path ?? "workspace"}-${index}`}>
            <strong>{translated === key ? message.message : translated}</strong>
            {message.path ? <code>{message.path}</code> : null}
          </p>
        );
      })}
    </div>
  );
}

const migrationVerifiedLabel = (
  result: WorkspaceMigrationResult,
  t: ReturnType<typeof useI18n>["t"],
) => (
  result.verification.fileCountMatches
    && result.verification.totalBytesMatches
    && result.verification.keyFilesPresent
    ? t("common.yes")
    : t("common.no")
);

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
};
