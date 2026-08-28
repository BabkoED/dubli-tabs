import { chromium, РАСШ } from './окружение.mjs';
import fs from 'fs';

// Подсветке нужен доступ к хосту. В настоящей установке его выдаёт Антон кнопкой
// в настройках, а из headless-браузера окно разрешений не нажать - поэтому
// гоняем копию, где разрешение уже прописано в манифесте.
const копия = fs.mkdtempSync('/tmp/dubli-mark-');
fs.cpSync(РАСШ, копия, { recursive: true });
const м = JSON.parse(fs.readFileSync(`${копия}/manifest.json`, 'utf8'));
м.host_permissions = ['*://redmine.test/*'];
fs.writeFileSync(`${копия}/manifest.json`, JSON.stringify(м, null, 2));
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/prof-'), {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${копия}`, `--load-extension=${копия}`],
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });

await ctx.route('https://redmine.test/**', (route) => route.fulfill({
  contentType: 'text/html; charset=utf-8',
  body: `<h1>Список тикетов</h1>
    <a id="a777" href="https://redmine.test/issues/777">Тикет 777</a><br>
    <a id="a888" href="https://redmine.test/issues/888?tab=history">Тикет 888 с хвостом</a><br>
    <a id="a999" href="https://redmine.test/issues/999">Тикет 999</a>`,
}));

// Включаем подсветку так же, как её включит Антон в настройках.
await sw.evaluate(() => chrome.storage.sync.set({ настройки: {
  тикеты: true, безЯкоря: true, безWww: true, мусор: ["tab", "utm_source"],
  подсветка: true, хостПодсветки: "redmine.test" } }));
await new Promise(r => setTimeout(r, 1200));

// Открыты 777 и 888. 999 не открыт.
for (const а of ['https://redmine.test/issues/777', 'https://redmine.test/issues/888']) {
  const p = await ctx.newPage(); await p.goto(а);
}
const список = await ctx.newPage();
await список.goto('https://redmine.test/projects/sbc/issues');
await список.waitForTimeout(1500);

for (const id of ['a777', 'a888', 'a999']) {
  const помечен = await список.evaluate((i) => document.getElementById(i).classList.contains('дубли-уже-открыт'), id);
  console.log(`${id}: ${помечен ? 'помечен «уже открыт»' : 'не помечен'}`);
}
await ctx.close();
