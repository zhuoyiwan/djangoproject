type CsvColumn<T> = {
  key: keyof T;
  label: string;
};

function buildExportTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

export function buildCsvFilename(featureName: string) {
  return `${featureName}_${buildExportTimestamp()}.csv`;
}

function parseFilenameFromDisposition(contentDisposition: string | null) {
  if (!contentDisposition) {
    return "";
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch = contentDisposition.match(/filename="([^"]+)"/i);
  return plainMatch?.[1] || "";
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value: unknown) {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadCsv<T extends Record<string, unknown>>(
  filename: string,
  columns: CsvColumn<T>[],
  rows: T[],
) {
  const header = columns.map((column) => escapeCsvValue(column.label)).join(",");
  const body = rows.map((row) => columns.map((column) => escapeCsvValue(row[column.key])).join(",")).join("\n");
  const content = `\uFEFF${header}\n${body}`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  triggerBlobDownload(blob, filename);
}

export async function downloadRemoteCsv(baseUrl: string, path: string, token: string, fallbackFeatureName: string) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    headers: {
      Accept: "text/csv",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    let message = `Request failed with ${response.status} ${response.statusText}`;
    try {
      const payload = (await response.json()) as {
        error?: {
          message?: string;
        };
      };
      if (payload.error?.message) {
        message = payload.error.message;
      }
    } catch {
      // keep fallback message
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const parsedFilename = parseFilenameFromDisposition(response.headers.get("Content-Disposition"));
  triggerBlobDownload(blob, parsedFilename || buildCsvFilename(fallbackFeatureName));
}
