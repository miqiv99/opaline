import { getVersion } from "@tauri-apps/api/app";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

const FALLBACK_VERSION = "0.1.0";

export type UpdateCheckResult = {
  currentVersion: string;
  update: Update | null;
};

export type UpdateProgress = {
  downloadedBytes: number;
  totalBytes: number | null;
};

export const getCurrentAppVersion = async () => {
  try {
    return await getVersion();
  } catch {
    return FALLBACK_VERSION;
  }
};

export const checkForAppUpdate = async (): Promise<UpdateCheckResult> => {
  const currentVersion = await getCurrentAppVersion();
  const update = await check();
  return {
    currentVersion: update?.currentVersion ?? currentVersion,
    update,
  };
};

export const installAppUpdate = async (
  update: Update,
  onProgress: (progress: UpdateProgress | null) => void,
) => {
  let downloadedBytes = 0;
  let totalBytes: number | null = null;

  await update.downloadAndInstall((event: DownloadEvent) => {
    if (event.event === "Started") {
      downloadedBytes = 0;
      totalBytes = event.data.contentLength ?? null;
      onProgress({ downloadedBytes, totalBytes });
      return;
    }

    if (event.event === "Progress") {
      downloadedBytes += event.data.chunkLength;
      onProgress({ downloadedBytes, totalBytes });
      return;
    }

    onProgress(null);
  });
};
