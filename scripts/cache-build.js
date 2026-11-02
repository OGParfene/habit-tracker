import { readdir, readFile, writeFile, rename } from "node:fs/promises";
const assets = (await readdir("dist/assets")).map((x) => "./assets/" + x);
const sw = await readFile("public/sw.js", "utf8");
await writeFile(
  "dist/sw.js",
  sw.replace(
    /const PRECACHE = \[.*?\];/,
    `const PRECACHE = ${JSON.stringify(["./", "./icon.svg", "./manifest.webmanifest", ...assets])};`,
  ),
);

await rename("dist/app.html", "dist/index.html");
