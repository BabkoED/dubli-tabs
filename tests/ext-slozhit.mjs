// «Сложить», когда вкладка закрылась на ходу.
//
//     ~/.local/bin/pw tests/ext-slozhit.mjs
//
// Провал - любое из:
//   1. вкладка, закрытая между закладками и закрытием, роняет tabs.remove, и
//      часть вкладок остаётся открытой;
//   2. отчёт говорит «не закрыты», когда закрыто;
//   3. закладка на тикет пропала.
// Ревью 22.10.2026 воспроизвело это пробой: закрыта одна из трёх, третья
// осталась висеть, а отчёт писал «Не вышло, вкладки не закрыты».
import { браузер } from "./окружение.mjs";

const итоги = [];
const проверка = (и, ок, ч = "") => итоги.push([и, ок, ч]);
const { ctx, sw, id } = await браузер();
await ctx.route("https://r.test/**", (r) => r.fulfill({ contentType: "text/html", body: "<title>t</title>" }));

const вкладки = [];
for (const n of [61, 62, 63]) {
  const p = await ctx.newPage();
  await p.goto(`https://r.test/issues/${n}`);
  вкладки.push(p);
}
const папка = await sw.evaluate(async () => (await chrome.bookmarks.create({ parentId: "1", title: "Т" })).id);
const окно = await ctx.newPage();
const ошибки = [];
окно.on("pageerror", (e) => ошибки.push(String(e)));
await окно.goto(`chrome-extension://${id}/popup.html`);
await окно.waitForTimeout(800);
await окно.click('nav.вкл button[data-раздел="закладки"]');
await окно.selectOption("#папка", папка);
// Закладки пишутся медленно, чтобы успеть закрыть вкладку посреди прохода.
await окно.evaluate(() => {
  const o = chrome.bookmarks.create.bind(chrome.bookmarks);
  chrome.bookmarks.create = async (...a) => { await new Promise((r) => setTimeout(r, 400)); return o(...a); };
});
await окно.click("#сложить");
await new Promise((r) => setTimeout(r, 500));
await вкладки[1].close();
await окно.waitForTimeout(3500);

const текст = await окно.textContent("#итог-закладки");
const закладки = await sw.evaluate(async (п) => (await chrome.bookmarks.getChildren(п)).map((b) => b.url), папка);
const остались = await sw.evaluate(() => chrome.tabs.query({ url: "https://r.test/*" }).then((t) => t.map((x) => x.url)));
проверка("все три тикета сохранены", закладки.length === 3, JSON.stringify(закладки));
проверка("живые вкладки закрыты", остались.length === 0, JSON.stringify(остались));
проверка("отчёт про закрытые, без «не закрыты»", /закрыто вкладок 2/.test(текст) && !/не закрыты/.test(текст), текст);
проверка("ошибок JS нет", !ошибки.length, JSON.stringify(ошибки));

await ctx.close();
let провалов = 0;
for (const [и, ок, ч] of итоги) {
  if (!ок) провалов++;
  console.log(`${ок ? "ок  " : "ПРОВАЛ"}  ${и}${ок ? "" : "  " + ч}`);
}
console.log(провалов ? `\nПРОВАЛОВ ${провалов} из ${итоги.length}` : `\nвсе ${итоги.length} проверок пройдены`);
process.exit(провалов ? 1 : 0);
