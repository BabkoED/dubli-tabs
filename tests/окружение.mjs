// Где взять playwright и само расширение. Вынесено сюда, чтобы в прогонах не
// торчали пути конкретной машины: репозиторий публичный, да и из клона на
// другом компьютере они всё равно не работают.
//
//   PLAYWRIGHT=/путь/к/node_modules/playwright/index.mjs  - если не в кеше npx
//   EXT=/путь/к/расширению                                - если не рядом
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const здесь = path.dirname(fileURLToPath(import.meta.url));

export const РАСШ = process.env.EXT || path.resolve(здесь, "..");
if (!fs.existsSync(path.join(РАСШ, "manifest.json"))) {
  throw new Error(`В ${РАСШ} нет manifest.json. Укажите папку расширения через EXT=`);
}

function найтиPlaywright() {
  if (process.env.PLAYWRIGHT) return process.env.PLAYWRIGHT;
  // Своя закреплённая версия (package.json) - первой: браузер в общем кеше
  // держится только за ту версию, что его поставила, чужая из npx его теряет.
  const свой = path.resolve(здесь, "..", "node_modules", "playwright", "index.mjs");
  if (fs.existsSync(свой)) return свой;
  const кеш = path.join(process.env.HOME || "", ".npm", "_npx");
  if (fs.existsSync(кеш)) {
    for (const д of fs.readdirSync(кеш)) {
      const п = path.join(кеш, д, "node_modules", "playwright", "index.mjs");
      if (fs.existsSync(п)) return п;
    }
  }
  return "playwright"; // обычная установка в проекте
}

export const { chromium } = await import(найтиPlaywright());

/** Постоянный контекст с загруженным расширением и его service worker. */
export async function браузер(папка = РАСШ) {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync("/tmp/prof-"), {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${папка}`, `--load-extension=${папка}`],
  });
  const sw = ctx.serviceWorkers()[0] ||
    await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  return { ctx, sw, id: new URL(sw.url()).host };
}
