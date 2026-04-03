import "./style.css";
import {
  fetchClips,
  createTextClip,
  uploadFileClip,
  claimClip,
  deleteClip,
  formatFileSize,
  type ClipEntry,
} from "./clipboard";
import { showQrModal, hideQrModal } from "./qr";

const clipInput = document.getElementById("clip-input") as HTMLTextAreaElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const clipsList = document.getElementById("clips-list") as HTMLUListElement;
const emptyMessage = document.getElementById("empty-message") as HTMLParagraphElement;
const clipCount = document.getElementById("clip-count") as HTMLSpanElement;
const qrBtn = document.getElementById("qr-btn") as HTMLButtonElement;
const qrClose = document.getElementById("qr-close") as HTMLButtonElement;
const imgClose = document.getElementById("img-close") as HTMLButtonElement;
const imgModal = document.getElementById("img-modal") as HTMLDivElement;
const modalImg = document.getElementById("modal-img") as HTMLImageElement;
const toast = document.getElementById("toast") as HTMLDivElement;

// ドロップゾーン
const dropZone = document.getElementById("drop-zone") as HTMLDivElement;

let polling: ReturnType<typeof setInterval> | null = null;

function showToast(msg: string, isError = false): void {
  toast.textContent = msg;
  toast.className = `toast ${isError ? "toast-error" : "toast-success"}`;
  toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 2500);
}

function renderClips(clips: ClipEntry[]): void {
  clipsList.innerHTML = "";
  emptyMessage.hidden = clips.length > 0;
  clipCount.textContent = String(clips.length);

  for (const clip of clips) {
    const li = document.createElement("li");
    li.className = `clip-card clip-${clip.type}`;
    li.dataset.id = clip.id;

    if (clip.type === "text") {
      li.append(renderTextClip(clip));
    } else if (clip.type === "image") {
      li.append(renderImageClip(clip));
    } else {
      li.append(renderFileClip(clip));
    }

    clipsList.append(li);
  }
}

function renderTextClip(clip: ClipEntry): DocumentFragment {
  const frag = document.createDocumentFragment();

  const preview = document.createElement("div");
  preview.className = "clip-text-preview";
  preview.textContent = clip.text ?? "";

  const actions = document.createElement("div");
  actions.className = "clip-actions";

  const copyBtn = document.createElement("button");
  copyBtn.className = "btn-copy";
  copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>コピー`;
  copyBtn.addEventListener("click", async () => {
    await navigator.clipboard.writeText(clip.text ?? "");
    await claimClip(clip.id);
    removeCard(clip.id);
    showToast("コピーしてサーバーから削除しましたわ");
  });

  const delBtn = document.createElement("button");
  delBtn.className = "btn-delete";
  delBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>`;
  delBtn.addEventListener("click", async () => {
    await deleteClip(clip.id);
    removeCard(clip.id);
  });

  actions.append(copyBtn, delBtn);
  frag.append(preview, actions);
  return frag;
}

function renderImageClip(clip: ClipEntry): DocumentFragment {
  const frag = document.createDocumentFragment();

  const imgWrap = document.createElement("div");
  imgWrap.className = "clip-img-wrap";

  const img = document.createElement("img");
  img.src = `/api/media/${clip.id}`;
  img.alt = clip.fileName ?? "画像";
  img.className = "clip-thumbnail";
  img.loading = "lazy";
  img.addEventListener("click", () => {
    modalImg.src = img.src;
    imgModal.hidden = false;
  });
  imgWrap.append(img);

  const meta = document.createElement("div");
  meta.className = "clip-meta";
  meta.textContent = `${clip.fileName ?? "image"} (${formatFileSize(clip.fileSize ?? 0)})`;

  const actions = document.createElement("div");
  actions.className = "clip-actions";

  const dlBtn = document.createElement("button");
  dlBtn.className = "btn-copy";
  dlBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>保存`;
  dlBtn.addEventListener("click", async () => {
    const a = document.createElement("a");
    a.href = `/api/media/${clip.id}`;
    a.download = clip.fileName ?? "download";
    a.click();
    setTimeout(async () => {
      await claimClip(clip.id);
      removeCard(clip.id);
      showToast("保存してサーバーから削除しましたわ");
    }, 500);
  });

  const delBtn = document.createElement("button");
  delBtn.className = "btn-delete";
  delBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>`;
  delBtn.addEventListener("click", async () => {
    await deleteClip(clip.id);
    removeCard(clip.id);
  });

  actions.append(dlBtn, delBtn);
  frag.append(imgWrap, meta, actions);
  return frag;
}

function renderFileClip(clip: ClipEntry): DocumentFragment {
  const frag = document.createDocumentFragment();

  const fileInfo = document.createElement("div");
  fileInfo.className = "clip-file-info";
  fileInfo.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
      <polyline points="13 2 13 9 20 9"/>
    </svg>
    <span>${clip.fileName ?? "file"}</span>
    <span class="file-size">${formatFileSize(clip.fileSize ?? 0)}</span>
  `;

  const actions = document.createElement("div");
  actions.className = "clip-actions";

  const dlBtn = document.createElement("button");
  dlBtn.className = "btn-copy";
  dlBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>ダウンロード`;
  dlBtn.addEventListener("click", async () => {
    const a = document.createElement("a");
    a.href = `/api/media/${clip.id}`;
    a.download = clip.fileName ?? "download";
    a.click();
    setTimeout(async () => {
      await claimClip(clip.id);
      removeCard(clip.id);
      showToast("DLしてサーバーから削除しましたわ");
    }, 500);
  });

  const delBtn = document.createElement("button");
  delBtn.className = "btn-delete";
  delBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>`;
  delBtn.addEventListener("click", async () => {
    await deleteClip(clip.id);
    removeCard(clip.id);
  });

  actions.append(dlBtn, delBtn);
  frag.append(fileInfo, actions);
  return frag;
}

function removeCard(id: string): void {
  const card = clipsList.querySelector(`[data-id="${id}"]`);
  if (card) {
    card.classList.add("fade-out");
    card.addEventListener("animationend", () => card.remove(), { once: true });
  }
  const remaining = clipsList.querySelectorAll(".clip-card").length - 1;
  clipCount.textContent = String(Math.max(0, remaining));
  if (remaining <= 0) emptyMessage.hidden = false;
}

async function loadClips(): Promise<void> {
  try {
    const { clips } = await fetchClips();
    renderClips(clips);
  } catch {
    // ネットワークエラーは無視
  }
}

async function sendText(): Promise<void> {
  const text = clipInput.value.trim();
  if (!text) return;
  sendBtn.disabled = true;
  try {
    await createTextClip(text);
    clipInput.value = "";
    await loadClips();
    showToast("送信しましたわ");
  } catch {
    showToast("送信に失敗しましたわ", true);
  } finally {
    sendBtn.disabled = false;
  }
}

async function sendFile(file: File): Promise<void> {
  if (file.size > 10 * 1024 * 1024) {
    showToast("10MB以上のファイルは送信できませんわ", true);
    return;
  }
  try {
    await uploadFileClip(file);
    await loadClips();
    showToast(`"${file.name}" を送信しましたわ`);
  } catch (e) {
    showToast(e instanceof Error ? e.message : "アップロード失敗", true);
  }
}

// 送信ボタン
sendBtn.addEventListener("click", sendText);

// Ctrl+Enter / Cmd+Enter で送信
clipInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    void sendText();
  }
});

// クリップボードから画像をペースト
clipInput.addEventListener("paste", async (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) await sendFile(file);
      return;
    }
  }
});

// ファイル選択
fileInput.addEventListener("change", async () => {
  const files = fileInput.files;
  if (!files) return;
  for (const file of files) {
    await sendFile(file);
  }
  fileInput.value = "";
});

// ドラッグ&ドロップ
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.hidden = false;
});
document.addEventListener("dragleave", (e) => {
  if (e.relatedTarget === null) dropZone.hidden = true;
});
document.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropZone.hidden = true;
  const files = e.dataTransfer?.files;
  if (!files) return;
  for (const file of files) {
    await sendFile(file);
  }
});

// QRコード
qrBtn.addEventListener("click", () => {
  void showQrModal(window.location.href);
});
qrClose.addEventListener("click", hideQrModal);
document.getElementById("qr-modal")
  ?.querySelector(".modal-backdrop")
  ?.addEventListener("click", hideQrModal);

// 画像モーダル
imgClose.addEventListener("click", () => { imgModal.hidden = true; });
imgModal.querySelector(".modal-backdrop")?.addEventListener("click", () => {
  imgModal.hidden = true;
});

// ポーリング開始
loadClips();
polling = setInterval(() => { void loadClips(); }, 3000);

// ページ離脱時にポーリング停止
window.addEventListener("beforeunload", () => {
  if (polling) clearInterval(polling);
});
