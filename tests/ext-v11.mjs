import { chromium, РАСШ } from './окружение.mjs';
import fs from 'fs';
const итоги = [];
const проверка = (имя, ок, что='') => итоги.push([имя, ок, что]);

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/prof-'), {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${РАСШ}`, `--load-extension=${РАСШ}`],
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const id = new URL(sw.url()).host;
await ctx.route('https://redmine.test/**', r => r.fulfill({ contentType: 'text/html',
  body: '<title>Задача #777: Не проходит 3DS - SBC - Redmine</title><h1>тикет</h1>' }));
await ctx.route('https://shop.test/**', r => r.fulfill({ contentType: 'text/html', body: '<title>Магазин</title>' }));

// ── 1. Горячая клавиша зарегистрирована ────────────────────────────────────
const команды = await sw.evaluate(() => chrome.commands.getAll());
проверка('команда есть в Chrome', команды.some(к => к.name === 'collapse-duplicates'), JSON.stringify(команды));
проверка('клавиша назначена', команды.some(к => к.shortcut && к.shortcut.length > 0), JSON.stringify(команды));

// ── 2. Заголовок группы с номером и темой ──────────────────────────────────
for (const а of ['https://redmine.test/issues/777', 'https://redmine.test/issues/777#note-7']) {
  const p = await ctx.newPage(); await p.goto(а);
}
const popup = await ctx.newPage();
const ошибки = [];
popup.on('pageerror', e => ошибки.push(String(e)));
await popup.goto(`chrome-extension://${id}/popup.html`);
await popup.waitForTimeout(900);
const шапка = (await popup.textContent('.группа .ключ')) || '';
проверка('в заголовке номер тикета', шапка.includes('#777'), шапка);
проверка('в заголовке тема, без слова Redmine', шапка.includes('3DS') && !шапка.includes('Redmine'), шапка);

// ── 3. Перехват повторного открытия ────────────────────────────────────────
await popup.click('nav.вкл button[data-раздел="настройки"]');
await popup.check('#н-перехват');
await popup.waitForTimeout(800);
const было = await sw.evaluate(() => chrome.tabs.query({ url: 'https://redmine.test/*' }).then(в => в.length));
const новая = await ctx.newPage();
await новая.goto('https://redmine.test/issues/777?tab=history').catch(() => {});
await new Promise(r => setTimeout(r, 1500));
const стало = await sw.evaluate(() => chrome.tabs.query({ url: 'https://redmine.test/*' }).then(в => в.length));
проверка('повторное открытие не создало вкладку', стало === было, `было ${было}, стало ${стало}`);
await popup.click('nav.вкл button[data-раздел="настройки"]');
await popup.uncheck('#н-перехват');
await popup.waitForTimeout(600);

// ── 4. Предупреждение о дубле закладки ─────────────────────────────────────
const папка = await sw.evaluate(async () => {
  const п = await chrome.bookmarks.create({ parentId: '1', title: 'Тикеты' });
  await chrome.bookmarks.create({ parentId: п.id, title: '777 старая', url: 'https://redmine.test/issues/777' });
  return п.id;
});
await new Promise(r => setTimeout(r, 800));
await sw.evaluate(() => chrome.notifications.getAll().then(в => Object.keys(в).forEach(k => chrome.notifications.clear(k))));
await sw.evaluate((п) => chrome.bookmarks.create({ parentId: п, title: '777 снова', url: 'https://redmine.test/issues/777?tab=history' }), папка);
await new Promise(r => setTimeout(r, 1500));
const уведомления = await sw.evaluate(() => chrome.notifications.getAll());
проверка('предупредило о повторной закладке', Object.keys(уведомления).length > 0, JSON.stringify(уведомления));

// ── 5. Сложить вкладки в папку ─────────────────────────────────────────────
const магазин = await ctx.newPage(); await магазин.goto('https://shop.test/cart');
const ещё = await ctx.newPage(); await ещё.goto('https://redmine.test/issues/888');
await popup.reload(); await popup.waitForTimeout(900);
await popup.click('nav.вкл button[data-раздел="закладки"]');
await popup.selectOption('#папка', папка);
await popup.click('#сложить');
await popup.waitForTimeout(2500);
const после = await sw.evaluate(async (п) => {
  const [у] = await chrome.bookmarks.getSubTree(п);
  const вкладки = await chrome.tabs.query({});
  return { закладки: (у.children || []).filter(д => д.url).map(д => д.url),
           тикеты: вкладки.filter(в => (в.url || '').includes('redmine.test')).length,
           магазин: вкладки.some(в => (в.url || '').includes('shop.test')) };
}, папка);
проверка('тикет 888 сохранён', после.закладки.some(u => u.includes('/888')), JSON.stringify(после.закладки));
проверка('уже сохранённый 777 не продублирован',
  после.закладки.filter(u => u.includes('/777')).length === 2, JSON.stringify(после.закладки));
проверка('вкладки тикетов закрыты', после.тикеты === 0, `осталось ${после.тикеты}`);
проверка('посторонняя вкладка не тронута', после.магазин === true);

// ── 6. Поиск по всем закладкам ─────────────────────────────────────────────
await sw.evaluate(() => chrome.bookmarks.create({ parentId: '2', title: '888 в другом месте', url: 'https://redmine.test/issues/888' }));
await popup.reload(); await popup.waitForTimeout(800);
await popup.click('nav.вкл button[data-раздел="закладки"]');
await popup.selectOption('#папка', 'ВСЕ');
await popup.click('#искать');
await popup.waitForTimeout(800);
проверка('«Все закладки» видит дубль между папками',
  /лишних/.test(await popup.textContent('#итог-закладки')), await popup.textContent('#итог-закладки'));

проверка('ошибок JS нет', ошибки.length === 0, ошибки.join(' | '));
await ctx.close();
let сбоев = 0;
for (const [имя, ок, что] of итоги) { if (!ок) сбоев++; console.log(`${ок?'ок  ':'СБОЙ'}  ${имя}${ок?'':'  << '+что}`); }
console.log(сбоев ? `\nСБОЕВ: ${сбоев} из ${итоги.length}` : `\nвсе ${итоги.length} проверок пройдены`);
