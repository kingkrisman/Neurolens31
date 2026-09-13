import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

let documentProxy: PDFDocumentProxy | null = null;
let renderTask: RenderTask | null = null;

export function hasPdfDocument(): boolean {
  return Boolean(documentProxy);
}

export function pdfDocumentPageCount(): number {
  return documentProxy?.numPages ?? 0;
}

export function rememberPdfDocument(next: PDFDocumentProxy) {
  if (documentProxy && documentProxy !== next) {
    renderTask?.cancel();
    void documentProxy.cleanup();
  }
  documentProxy = next;
}

export function forgetPdfDocument() {
  renderTask?.cancel();
  renderTask = null;
  if (documentProxy) {
    void documentProxy.cleanup();
    documentProxy = null;
  }
}

export async function renderPdfPage(
  pageNumber: number,
  canvas: HTMLCanvasElement,
  maxCssWidth: number,
): Promise<boolean> {
  if (!documentProxy) return false;
  const page = await documentProxy.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const cssWidth = Math.max(280, Math.min(maxCssWidth, base.width));
  const scale = cssWidth / base.width;
  const viewport = page.getViewport({ scale });
  const outputScale = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;

  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  const context = canvas.getContext("2d");
  if (!context) return false;
  context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

  renderTask?.cancel();
  const task = page.render({
    canvas,
    canvasContext: context,
    viewport,
  });
  renderTask = task;
  try {
    await task.promise;
    return true;
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "RenderingCancelledException") return false;
    throw error;
  } finally {
    if (renderTask === task) renderTask = null;
  }
}
