/**
 * Tell the desktop shell how long the camera and screen allow should last.
 * A browser has no shell, so this is a no-op and the page holds the streams itself.
 */

import { captureGrantRequest, type SessionCaptureSettings } from './core/sessionCapture.ts';

export async function publishCaptureGrant(settings: SessionCaptureSettings): Promise<void> {
  const send = (globalThis as { window?: Window }).window?.humanuscript?.setCaptureGrant;
  if (!send) return;
  await send(captureGrantRequest(settings));
}
