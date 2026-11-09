// Renders the SlashConnect home-screen icons from public/slashconnect-icon.svg.
// Run with `node scripts/make-slash-icons.mjs` after changing the drawing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const svg = fs.readFileSync(path.join(publicDir, "slashconnect-icon.svg"), "utf8");
for (const size of [180, 192, 512]) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  fs.writeFileSync(path.join(publicDir, `slashconnect-${size}.png`), png);
}
