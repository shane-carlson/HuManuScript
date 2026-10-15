#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { copyFile, mkdir, stat, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const demoText = 'Typed here.';
const demoHash = createHash('sha256').update(demoText, 'utf8').digest('hex');

const STORE_MEDIA = '/cursor/stores/bc-eb9419a7-98d0-48d3-938e-3eaa9ba3d646/media';
const BASE = 'http://127.0.0.1:47321';

async function saveWebp(page, webpPath, clip) {
  const pngPath = `/tmp/hm-demo-${path.basename(webpPath, '.webp')}.png`;
  await page.screenshot({ path: pngPath, clip, fullPage: false });
  const result = spawnSync('ffmpeg', ['-y', '-i', pngPath, '-quality', '85', webpPath], { stdio: 'pipe' });
  await unlink(pngPath).catch(() => {});
  if (result.status !== 0) throw new Error(result.stderr?.toString() || 'ffmpeg failed');
  const info = await stat(webpPath);
  if (info.size < 800) throw new Error(`${webpPath} too small (${info.size} bytes)`);
}

const certifiedPoint = {
  id: 'pt-demo',
  blockId: 'p-demo',
  spanId: 's-demo',
  text: demoText,
  contentHash: demoHash,
  sealedAt: '2026-03-15T12:00:00.000Z',
  updatedAt: '2026-03-15T12:00:00.000Z',
  origin: 'keyboard',
  evidence: { inputTypes: ['insertText'], eventCount: 28, events: [] },
  priorHashes: [],
  typingDevice: 'Linux',
};

const library = {
  version: 2,
  activeBookId: 'book-demo',
  series: [],
  books: [
    {
      id: 'book-demo',
      title: 'Harbor Light',
      document: {
        version: 1,
        manuscriptId: 'book-demo',
        title: 'Harbor Light',
        blocks: [
          { id: 'ch-demo', type: 'chapter', title: 'Opening', text: '', marks: [] },
          { id: 'p-demo', type: 'paragraph', title: '', text: demoText, marks: [] },
        ],
        provenance: {
          'ch-demo': { title: [], text: [] },
          'p-demo': {
            title: [],
            text: [
              {
                id: 's-demo',
                start: 0,
                end: 11,
                origin: 'keyboard',
                certificationId: 'pt-demo',
              },
            ],
          },
        },
        points: [certifiedPoint],
        moves: [],
      },
    },
  ],
};

async function main() {
  await mkdir(STORE_MEDIA, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  await page.goto(BASE);
  await page.evaluate((lib) => {
    localStorage.setItem('humanuscript.library.v2', JSON.stringify(lib));
    sessionStorage.setItem('humanuscript.workspaceTab', 'manuscript');
    sessionStorage.removeItem('humanuscript.certificationCollapsed');
  }, library);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const statsBar = page.locator('.manuscript-stats-bar');
  await statsBar.waitFor({ timeout: 10000 });
  const statsBox = await statsBar.boundingBox();
  if (!statsBox) throw new Error('stats bar not found');
  await saveWebp(page, path.join(STORE_MEDIA, 'stats-one-row.webp'), statsBox);

  await page.getByRole('button', { name: 'Collapse certification pane' }).click();
  await page.waitForTimeout(300);
  const editor = page.locator('.editor-layout');
  const editorBox = await editor.boundingBox();
  if (!editorBox) throw new Error('editor layout not found');
  const certClip = {
    x: editorBox.x + editorBox.width - 220,
    y: editorBox.y,
    width: 220,
    height: Math.min(editorBox.height, 520),
  };
  await saveWebp(page, path.join(STORE_MEDIA, 'certification-pane-collapsed.webp'), certClip);

  await page.getByRole('button', { name: 'Expand certification pane' }).click();
  await page.waitForTimeout(300);
  const deviceLine = page.locator('.point-device').first();
  await deviceLine.waitFor({ timeout: 10000 });
  const deviceBox = await deviceLine.boundingBox();
  if (!deviceBox) throw new Error('device line not found');
  const pad = { x: Math.max(0, deviceBox.x - 24), y: deviceBox.y - 8, width: deviceBox.width + 280, height: deviceBox.height + 120 };
  await saveWebp(page, path.join(STORE_MEDIA, 'device-on-certification.webp'), pad);

  await browser.close();

  const iconOut = path.join(STORE_MEDIA, 'icon-silhouette.png');
  await copyFile(path.join('/workspace', 'build', 'icon.png'), iconOut);
  const iconStat = await stat(iconOut);
  if (iconStat.size < 800) throw new Error('icon too small');

  for (const name of [
    'stats-one-row.webp',
    'certification-pane-collapsed.webp',
    'device-on-certification.webp',
    'icon-silhouette.png',
  ]) {
    const p = path.join(STORE_MEDIA, name);
    const s = await stat(p);
    console.log(p, s.size);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
