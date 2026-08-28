import { chromium, РАСШ } from './окружение.mjs';
import fs from 'fs';

const профиль = fs.mkdtempSync('/tmp/prof-');
const ctx = await chromium.launchPersistentContext(профиль, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${РАСШ}`, `--load-extension=${РАСШ}`],
});

let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const id = new URL(sw.url()).host;
console.log('расширение загрузилось, id:', id);

// Подставляем страницы вместо сети: интернет тут не нужен, нужны адреса.
await ctx.route('https://redmine.test/**', (route) =>
  route.fulfill({ contentType: 'text/html', body: '<h1>тикет</h1><a href="https://redmine.test/issues/777">777</a>' }));

const адреса = [
  'https://redmine.test/issues/777',
  'https://redmine.test/issues/777#note-7',
  'https://redmine.test/issues/777?tab=history',
  'https://redmine.test/issues/888',
];
for (const а of адреса) { const p = await ctx.newPage(); await p.goto(а); }
await new Promise(r => setTimeout(r, 1500));

const значок = await sw.evaluate(() => chrome.action.getBadgeText({}));
console.log('значок показывает:', JSON.stringify(значок), '(ждём "2")');

const popup = await ctx.newPage();
const ошибки = [];
popup.on('pageerror', (e) => ошибки.push(String(e)));
await popup.goto(`chrome-extension://${id}/popup.html`);
await popup.waitForTimeout(1200);
console.log('итог в окне:', await popup.textContent('#итог-вкладки'));
console.log('групп нарисовано:', await popup.locator('.группа').count());
console.log('кнопка:', await popup.textContent('#схлопнуть'));

await popup.click('#схлопнуть');
await popup.waitForTimeout(1200);
console.log('после схлопывания:', await popup.textContent('#итог-вкладки'));
const осталось = ctx.pages().filter(p => p.url().startsWith('https://redmine.test')).map(p => p.url());
console.log('осталось вкладок redmine:', осталось.length, осталось);
console.log('ошибки JS:', ошибки.length ? ошибки : 'нет');

await ctx.close();
