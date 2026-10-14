/**
 * Renders a page of an edited cert to a PNG so it can be checked on screen
 * before anything is downloaded or sent out.
 */

export async function renderPage(
  blob: Blob,
  pageNumber: number,
  width = 900
): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const doc = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;

  try {
    const page = await doc.getPage(Math.min(pageNumber, doc.numPages));
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not draw the preview");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: context, viewport }).promise;

    return canvas.toDataURL("image/png");
  } finally {
    await doc.destroy();
  }
}
