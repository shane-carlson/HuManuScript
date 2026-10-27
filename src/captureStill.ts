/**
 * Camera and screen stills. Both wait for the browser or system permission prompt.
 * Nothing here runs unless the matching setting is on.
 */

import {
  THUMBNAIL_JPEG_QUALITY,
  grabConsentedStill,
  isPermissionDenial,
  thumbnailSize,
  type SessionCaptureSettings,
  type StillImage,
} from './core/sessionCapture.ts';

export class CaptureDeviceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaptureDeviceError';
  }
}

async function streamToThumbnail(stream: MediaStream): Promise<StillImage> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    throw new CaptureDeviceError('The camera or screen did not start.');
  }
  if (video.videoWidth === 0) {
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
  const size = thumbnailSize(video.videoWidth, video.videoHeight);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new CaptureDeviceError('Could not draw the thumbnail.');
  context.drawImage(video, 0, 0, size.width, size.height);
  video.pause();
  video.srcObject = null;
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/jpeg', THUMBNAIL_JPEG_QUALITY);
  });
  if (!blob) throw new CaptureDeviceError('Could not store the thumbnail.');
  return { blob, width: size.width, height: size.height, mime: 'image/jpeg' };
}

export interface SessionMedia {
  /** One camera still, then the camera is released. */
  camera: () => Promise<StillImage | null>;
  /**
   * One screen still. The first call shows the browser or system share prompt.
   * The share stays up for later thumbnails and is released with `release`.
   */
  screenshot: () => Promise<StillImage | null>;
  release: () => void;
}

export function createSessionMedia(read: () => SessionCaptureSettings): SessionMedia {
  let screen: MediaStream | null = null;

  const release = () => {
    if (!screen) return;
    for (const track of screen.getTracks()) track.stop();
    screen = null;
  };

  return {
    release,
    camera: () =>
      grabConsentedStill({
        allowed: () => read().camera,
        open: async () => {
          if (!navigator.mediaDevices?.getUserMedia) {
            throw new CaptureDeviceError('This browser has no camera API.');
          }
          return navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: 'user' },
          });
        },
        draw: streamToThumbnail,
      }),
    screenshot: async () => {
      if (!read().screenshot) {
        release();
        return null;
      }
      const live = screen?.getVideoTracks().some((track) => track.readyState === 'live') ?? false;
      if (!live) {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          throw new CaptureDeviceError('This browser cannot capture the screen.');
        }
        try {
          screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        } catch (error) {
          if (isPermissionDenial(error)) return null;
          throw error;
        }
        screen.getVideoTracks().forEach((track) => {
          track.addEventListener('ended', () => {
            if (screen && screen.getVideoTracks().every((item) => item.readyState !== 'live')) screen = null;
          });
        });
      }
      if (!read().screenshot || !screen) {
        release();
        return null;
      }
      return streamToThumbnail(screen);
    },
  };
}
