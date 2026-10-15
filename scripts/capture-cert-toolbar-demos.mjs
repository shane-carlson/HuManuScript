#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const STORE_MEDIA = '/cursor/stores/bc-eb9419a7-98d0-48d3-938e-3eaa9ba3d646/media';
const BASE = 'http://127.0.0.1:47321';
const demoText = 'Typed here.';
const demoHash = createHash('sha256').update(demoText, 'utf8').digest('hex');

const library = {
  version: 2,
  activeBookId: 'book-demo',
  series: [],
  books: [{
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
          text: [{ id: 's-demo', start: 0, end: 11, origin: 'keyboard', certificationId: 'pt-demo' }],
        },
      },
      points: [{
        id: 'pt-demo', blockId: 'p-demo', spanId: 's-demo', text: demoText, contentHash: demoHash,
        sealedAt: '2026-03-15T12:00:00.000Z', updatedAt: '2026-03-15T12:00:00.000Z', origin: 'keyboard',
        evidence: { inputTypes: ['insertText'], eventCount: 28, events: [] }, priorHashes: [], typingDevice: 'Linux',
      }],
      moves: [],
    },
  }],
};

async function saveFullWebp(page, webpPath) {
  const pngPath = `/tmp/hm-full-${path.basename(webpPath, '.webp')}.png`;
  await page.screenshot({ path: pngPath, fullPage: false });
  const result = spawnSync('ffmpeg', ['-y', '-i', pngPath, '-quality', '85', webpPath], { stdio: 'pipe' });
  await unlink(pngPath).catch(() => {});
  if (result.status !== 0) throw new Error(result.stderr?.toString() || 'ffmpeg failed');
  const info = await stat(webpPath);
  if (info.size < 15000) throw new Error(`${webpPath} too small (${info.size} bytes)`);
  console.log(webpPath, info.size);
}

async function seed(page) {
  await page.goto(BASE);
  await page.evaluate((lib) => {
    localStorage.setItem('humanuscript.library.v2', JSON.stringify(lib));
    sessionStorage.setItem('humanuscript.workspaceTab', 'manuscript');
    sessionStorage.removeItem('humanuscript.certificationCollapsed');
  }, library);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
}

async function main() {
  await mkdir(STORE_MEDIA, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  await seed(page);

  await page.getByRole('button', { name: 'Collapse certification pane' }).click();
  await page.waitForTimeout(400);
  await page.locator('.cert-collapse-toggle.is-collapsed-mark').waitFor({ timeout: 10000 });
  await saveFullWebp(page, path.join(STORE_MEDIA, 'cert-lock-collapsed.webp'));

  await page.getByRole('button', { name: 'Expand certification pane' }).click();
  await page.waitForTimeout(400);
  await page.locator('.points-head__mark').waitFor({ timeout: 10000 });
  await saveFullWebp(page, path.join(STORE_MEDIA, 'cert-lock-open.webp'));

  await page.getByRole('button', { name: 'Collapse certification pane' }).click();
  await page.waitForTimeout(400);
  await page.locator('.toolbar-icon-btn').first().waitFor({ timeout: 10000 });
  await saveFullWebp(page, path.join(STORE_MEDIA, 'icon-toolbar.webp'));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
