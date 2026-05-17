import { useState } from "react";
import { useI18n } from "../i18n";

interface WorkspaceMigrationDialogProps {
  open: boolean;
  oldPath: string;
  newPath: string;
  onCopy: () => Promise<void>;
  onMove: () => Promise<void>;
  onCancel: () => void;
}

type MigrationPhase = "prompt" | "migrating" | "done" | "error";

export function WorkspaceMigrationDialog({
  open,
  oldPath,
  newPath,
  onCopy,
  onMove,
  onCancel,
}: WorkspaceMigrationDialogProps) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<MigrationPhase>("prompt");
  const [error, setError] = useState("");

  if (!open) return null;

  const run = async (action: "copy" | "move") => {
    setPhase("migrating");
    setError("");
    try {
      if (action === "copy") {
        await onCopy();
      } else {
        await onMove();
      }
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("migration.errorFallback"));
      setPhase("error");
    }
  };

  const close = () => {
    setPhase("prompt");
    setError("");
    onCancel();
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={phase === "migrating" ? undefined : close}>
      <section
        className="note-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="migration-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {phase === "prompt" ? (
          <>
            <div className="note-dialog-header">
              <h2 id="migration-title">{t("migration.title")}</h2>
              <p>{t("migration.description")}</p>
            </div>
            <div className="migration-paths">
              <div className="migration-path-row">
                <span>{t("migration.current")}</span>
                <code>{oldPath}</code>
              </div>
              <div className="migration-path-row">
                <span>{t("migration.newLocation")}</span>
                <code>{newPath}</code>
              </div>
            </div>
            <div className="dialog-actions">
              <button type="button" className="dialog-secondary" onClick={close}>
                {t("action.cancel")}
              </button>
              <button type="button" className="dialog-primary" onClick={() => run("copy")}>
                {t("migration.copy")}
              </button>
              <button type="button" className="dialog-primary" onClick={() => run("move")}>
                {t("migration.move")}
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
        ) : phase === "done" ? (
          <>
            <div className="note-dialog-header">
              <h2>{t("migration.doneTitle")}</h2>
              <p>{t("migration.doneDesc")}</p>
            </div>
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
