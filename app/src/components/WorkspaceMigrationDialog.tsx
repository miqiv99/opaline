import { useState } from "react";

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
      setError(err instanceof Error ? err.message : "迁移失败");
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
              <h2 id="migration-title">工作区迁移</h2>
              <p>更换工作区位置时，你可以将已有笔记和资源一起带过去。</p>
            </div>
            <div className="migration-paths">
              <div className="migration-path-row">
                <span>当前</span>
                <code>{oldPath}</code>
              </div>
              <div className="migration-path-row">
                <span>新位置</span>
                <code>{newPath}</code>
              </div>
            </div>
            <div className="dialog-actions">
              <button type="button" className="dialog-secondary" onClick={close}>
                取消
              </button>
              <button type="button" className="dialog-primary" onClick={() => run("copy")}>
                复制到新位置
              </button>
              <button type="button" className="dialog-primary" onClick={() => run("move")}>
                移动到新位置
              </button>
            </div>
          </>
        ) : phase === "migrating" ? (
          <>
            <div className="note-dialog-header">
              <h2>正在迁移...</h2>
              <p>请稍候，笔记和资源正在转移到新位置。</p>
            </div>
            <p className="migration-status">
              <span className="spinner" />
              迁移中...
            </p>
          </>
        ) : phase === "done" ? (
          <>
            <div className="note-dialog-header">
              <h2>迁移完成</h2>
              <p>工作区已成功迁移到新位置。</p>
            </div>
            <div className="dialog-actions">
              <button type="button" className="dialog-primary" onClick={close}>
                确定
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="note-dialog-header">
              <h2>迁移失败</h2>
              <p>{error}</p>
            </div>
            <div className="dialog-actions">
              <button type="button" className="dialog-secondary" onClick={close}>
                关闭
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
