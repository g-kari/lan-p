import QRCode from "qrcode";

export async function showQrModal(url: string): Promise<void> {
  const modal = document.getElementById("qr-modal") as HTMLDivElement;
  const container = document.getElementById("qr-container") as HTMLDivElement;
  const urlEl = document.getElementById("qr-url") as HTMLParagraphElement;

  container.innerHTML = "";

  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, url, {
    width: 240,
    margin: 2,
    color: { dark: "#1a1a2e", light: "#ffffff" },
  });
  container.appendChild(canvas);

  urlEl.textContent = url;
  modal.hidden = false;
}

export function hideQrModal(): void {
  const modal = document.getElementById("qr-modal") as HTMLDivElement;
  modal.hidden = true;
}
