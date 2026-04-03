export interface ClipEntry {
  id: string;
  type: "text" | "image" | "file";
  text?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  createdAt: number;
}

export async function fetchClips(): Promise<{ clips: ClipEntry[] }> {
  const res = await fetch("/api/clips");
  if (!res.ok) throw new Error("Failed to fetch clips");
  return res.json() as Promise<{ clips: ClipEntry[] }>;
}

export async function createTextClip(text: string): Promise<ClipEntry> {
  const res = await fetch("/api/clips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("Failed to create clip");
  const data = await res.json() as { clip: ClipEntry };
  return data.clip;
}

export async function uploadFileClip(file: File): Promise<ClipEntry> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/clips/upload", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json() as { error: string };
    throw new Error(err.error || "Upload failed");
  }
  const data = await res.json() as { clip: ClipEntry };
  return data.clip;
}

export async function claimClip(id: string): Promise<void> {
  await fetch(`/api/clips/${id}/claim`, { method: "POST" });
}

export async function deleteClip(id: string): Promise<void> {
  await fetch(`/api/clips/${id}`, { method: "DELETE" });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
