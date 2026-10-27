/**
 * One session picture. The screenshot is the frame. The camera sits in the
 * upper left. Streams stay open for the permission the writer chose, so a
 * later picture in that span does not ask again.
 */

import { publishCaptureGrant } from './captureGrant.ts';
import {
  COMPOSITE_JPEG_QUALITY,
  COMPOSITE_MAX_HEIGHT,
  COMPOSITE_MAX_WIDTH,
  cameraOverlayRect,
  fitWithin,
  holdConsentedStream,
  isPermissionDenial,
  sessionCaptureConfigured,
  type SessionCaptureSettings,
  type StillImage,
} from './core/sessionCapture.ts';

export class CaptureDeviceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaptureDeviceError';
  }
}

function stopStream(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
}

async function waitForFrame(video: HTMLVideoElement): Promise<void> {
  try {
    await video.play();
  } catch {
    throw new CaptureDeviceError('The camera or screen did not start.');
  }
  if (video.videoWidth > 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new CaptureDeviceError('The camera or screen did not return a picture.'));
    }, 4000);
    video.onloadeddata = () => {
      window.clearTimeout(timer);
      resolve();
    };
  });
}

async function frameFromStream(stream: MediaStream): Promise<HTMLCanvasElement> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await waitForFrame(video);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new CaptureDeviceError('Could not draw the session picture.');
    context.drawImage(video, 0, 0);
    return canvas;
  } finally {
    video.pause();
    video.srcObject = null;
  }
}

async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<StillImage> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/jpeg', COMPOSITE_JPEG_QUALITY);
  });
  if (!blob) throw new CaptureDeviceError('Could not store the session picture.');
  return { blob, width: canvas.width, height: canvas.height, mime: 'image/jpeg' };
}

/** Screenshot base, camera in the upper left. Camera alone is the whole frame. */
export async function paintComposite(
  screen: HTMLCanvasElement | null,
  camera: HTMLCanvasElement | null,
): Promise<StillImage> {
  const base = screen ?? camera;
  if (!base) throw new CaptureDeviceError('Could not draw the session picture.');
  const size = fitWithin(base.width, base.height, COMPOSITE_MAX_WIDTH, COMPOSITE_MAX_HEIGHT);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new CaptureDeviceError('Could not draw the session picture.');
  context.drawImage(base, 0, 0, size.width, size.height);
  if (screen && camera) {
    const overlay = cameraOverlayRect(size.width, size.height, camera.width, camera.height);
    context.fillStyle = '#111111';
    context.fillRect(
      overlay.x - 2,
      overlay.y - 2,
      overlay.width + 4,
      overlay.height + 4,
    );
    context.drawImage(camera, overlay.x, overlay.y, overlay.width, overlay.height);
    context.strokeStyle = '#f4f1ea';
    context.lineWidth = 2;
    context.strokeRect(overlay.x, overlay.y, overlay.width, overlay.height);
  }
  return canvasToJpeg(canvas);
}

export interface SessionMedia {
  /** One composite from the streams granted for the current permission. */
  composite: () => Promise<StillImage | null>;
  /** Drop tracks the current setting no longer allows. Does not open a device. */
  sync: () => void;
  /** Stop the camera and the screen. */
  release: () => void;
}

export function createSessionMedia(read: () => SessionCaptureSettings): SessionMedia {
  let camera: MediaStream | null = null;
  let screen: MediaStream | null = null;

  const releaseCamera = () => {
    stopStream(camera);
    camera = null;
  };
  const releaseScreen = () => {
    stopStream(screen);
    screen = null;
  };
  const release = () => {
    releaseCamera();
    releaseScreen();
  };

  const sync = () => {
    if (!read().camera) releaseCamera();
    if (!read().screenshot) releaseScreen();
    if (!sessionCaptureConfigured(read())) release();
  };

  return {
    release,
    sync,
    composite: async () => {
      const settings = read();
      if (!sessionCaptureConfigured(settings)) {
        release();
        return null;
      }
      await publishCaptureGrant(settings);
      if (!read().screenshot) releaseScreen();
      if (!read().camera) releaseCamera();

      let screenFrame: HTMLCanvasElement | null = null;
      let cameraFrame: HTMLCanvasElement | null = null;
      let screenError: unknown = null;

      if (read().screenshot) {
        try {
          const next = await holdConsentedStream({
            allowed: () => read().screenshot,
            current: screen,
            open: async () => {
              if (!navigator.mediaDevices?.getDisplayMedia) {
                throw new CaptureDeviceError('This browser cannot capture the screen.');
              }
              return navigator.mediaDevices.getDisplayMedia({
                video: { width: { ideal: COMPOSITE_MAX_WIDTH }, height: { ideal: COMPOSITE_MAX_HEIGHT } },
                audio: false,
              });
            },
          });
          if (next !== screen) {
            releaseScreen();
            screen = next;
            screen?.getVideoTracks().forEach((track) => {
              track.addEventListener('ended', () => {
                if (screen && screen.getVideoTracks().every((item) => item.readyState !== 'live')) screen = null;
              });
            });
          }
          if (!read().screenshot) releaseScreen();
          else if (screen) screenFrame = await frameFromStream(screen);
        } catch (error) {
          if (!isPermissionDenial(error)) screenError = error;
        }
      }

      if (read().camera) {
        try {
          const next = await holdConsentedStream({
            allowed: () => read().camera,
            current: camera,
            open: async () => {
              if (!navigator.mediaDevices?.getUserMedia) {
                throw new CaptureDeviceError('This browser has no camera API.');
              }
              return navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 360 } },
              });
            },
          });
          if (next !== camera) {
            releaseCamera();
            camera = next;
          }
          if (!read().camera) releaseCamera();
          else if (camera) cameraFrame = await frameFromStream(camera);
        } catch (error) {
          if (!isPermissionDenial(error) && !screenFrame) throw error;
        }
      }

      if (!screenFrame && !cameraFrame) {
        if (screenError) throw screenError;
        return null;
      }
      if (!sessionCaptureConfigured(read())) {
        release();
        return null;
      }
      return paintComposite(screenFrame, cameraFrame);
    },
  };
}
