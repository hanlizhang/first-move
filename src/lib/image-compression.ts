export const MAX_MORNING_IMAGE_DIMENSION = 768;

export async function compressImageToJpeg(source: Blob, maxDimension = MAX_MORNING_IMAGE_DIMENSION): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await canvasBlob(canvas);
  } finally {
    bitmap.close();
  }
}

export async function captureVideoFrame(video: HTMLVideoElement): Promise<Blob> {
  if (!video.videoWidth || !video.videoHeight) throw new Error("The camera is not ready yet.");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image capture is unavailable.");
  context.drawImage(video, 0, 0);
  const frame = await canvasBlob(canvas);
  return compressImageToJpeg(frame);
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image compression failed.")), "image/jpeg", 0.82));
}
