// Draws every SlashConnect icon and launch screen: the web app's home-screen
// icons in public/, and the icons and launch screens inside android/ and ios/.
// Run with `node scripts/make-slash-icons.mjs` after changing the mark.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAPER = "#fff1ea";
const MARK = `<circle cx="24" cy="34" r="16" fill="#ff5a7a"/>
    <circle cx="42" cy="30" r="14" fill="#12b5a8"/>
    <path d="M30 12l6 40" stroke="#2a1b33" stroke-width="3.5" stroke-linecap="round"/>`;

/** The mark is 48 wide and 44 tall, centred on (32, 32) in its own units. */
function drawing({ width, height = width, markWidth, paper = "rect" }) {
  const scale = markWidth / 48;
  const back =
    paper === "rect" ? `<rect width="${width}" height="${height}" fill="${PAPER}"/>`
    : paper === "round" ? `<circle cx="${width / 2}" cy="${height / 2}" r="${width / 2}" fill="${PAPER}"/>`
    : paper === "soft" ? `<rect width="${width}" height="${height}" rx="${width * 0.18}" fill="${PAPER}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  ${back}
  <g transform="translate(${width / 2 - 32 * scale} ${height / 2 - 32 * scale}) scale(${scale})">
    ${MARK}
  </g>
</svg>
`;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(zlib.crc32(body), body.length + 4);
  return out;
}

/** A PNG with no alpha channel, which is what Apple asks of an app icon. */
function opaquePng(svg, width) {
  const image = new Resvg(svg, { fitTo: { mode: "width", value: width }, background: PAPER }).render();
  const { width: w, height: h, pixels } = image;
  const rows = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y += 1) {
    let at = y * (1 + w * 3) + 1;
    for (let x = 0; x < w; x += 1) {
      const from = (y * w + x) * 4;
      rows[at++] = pixels[from];
      rows[at++] = pixels[from + 1];
      rows[at++] = pixels[from + 2];
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", head),
    chunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const clearPng = (svg, width) => new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();

function write(file, data) {
  const target = path.join(root, file);
  if (!fs.existsSync(path.dirname(target))) return;
  fs.writeFileSync(target, data);
}

// Web app
write("public/slashconnect-icon.svg", drawing({ width: 512, markWidth: 216 }));
for (const size of [180, 192, 512]) {
  write(`public/slashconnect-${size}.png`, clearPng(drawing({ width: 512, markWidth: 216 }), size));
}

// Android. The adaptive icon's foreground keeps the mark inside the middle
// 61%, the part every launcher shape leaves showing.
const res = "android/app/src/main/res";
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, times] of Object.entries(densities)) {
  write(`${res}/mipmap-${name}/ic_launcher.png`, clearPng(drawing({ width: 48, markWidth: 26, paper: "soft" }), 48 * times));
  write(`${res}/mipmap-${name}/ic_launcher_round.png`, clearPng(drawing({ width: 48, markWidth: 26, paper: "round" }), 48 * times));
  write(`${res}/mipmap-${name}/ic_launcher_foreground.png`, clearPng(drawing({ width: 108, markWidth: 46, paper: "none" }), 108 * times));
}
const launch = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
for (const [name, [short, long]] of Object.entries(launch)) {
  write(`${res}/drawable-port-${name}/splash.png`, opaquePng(drawing({ width: short, height: long, markWidth: short * 0.3 }), short));
  write(`${res}/drawable-land-${name}/splash.png`, opaquePng(drawing({ width: long, height: short, markWidth: short * 0.3 }), long));
}
write(`${res}/drawable/splash.png`, opaquePng(drawing({ width: 480, height: 320, markWidth: 96 }), 480));

// iOS
const assets = "ios/App/App/Assets.xcassets";
write(`${assets}/AppIcon.appiconset/AppIcon-512@2x.png`, opaquePng(drawing({ width: 1024, markWidth: 440 }), 1024));
const splash = opaquePng(drawing({ width: 2732, markWidth: 360 }), 2732);
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  write(`${assets}/Splash.imageset/${name}`, splash);
}
