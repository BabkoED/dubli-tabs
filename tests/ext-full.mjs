import { chromium, РАСШ } from './окружение.mjs';
import fs from 'fs';

const итоги = [];
const проверка = (имя, ок, что = '') => { итоги.push([имя, ок, что]); };

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/prof-'), {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${РАСШ}`, `--load-extension=${РАСШ}`],
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const id = new URL(sw.url()).host;
await ctx.route('https://redmine.test/**', r => r.fulfill({ contentType: 'text/html', body: '<h1>тикет</h1>' }));

// ── Окно 1: три вида одного тикета, первый закреплён ───────────────────────
const адреса1 = ['https://redmine.test/issues/777',
                 'https://redmine.test/issues/777#note-7',
                 'https://redmine.test/issues/777?tab=history'];
const страницы = [];
for (const а of адреса1) { const p = await ctx.newPage(); await p.goto(а); страницы.push(p); }
await sw.evaluate(async () => {
  const [первая] = await chrome.tabs.query({ url: 'https://redmine.test/issues/777' });
  await chrome.tabs.update(первая.id, { pinned: true });
});

// ── Окно 2: ещё один тот же тикет и другой ─────────────────────────────────
await sw.evaluate(() => chrome.windows.create({ url: ['https://redmine.test/issues/777', 'https://redmine.test/issues/888'] }));
await new Promise(r => setTimeout(r, 2000));

const значок = await sw.evaluate(() => chrome.action.getBadgeText({}));
проверка('значок считает дубли из двух окон', значок === '3', `значок = "${значок}", ждали "3"`);

const popup = await ctx.newPage();
const ошибки = [];
popup.on('pageerror', e => ошибки.push(String(e)));
await popup.goto(`chrome-extension://${id}/popup.html`);
await popup.waitForTimeout(1000);

const первая = await popup.locator('.группа .пункт').first().textContent();
проверка('первой в группе стоит закреплённая', /закреплена/.test(первая), `первая строка: ${первая.trim()}`);
проверка('кнопка обещает закрыть 3', (await popup.textContent('#схлопнуть')).includes('(3)'),
         await popup.textContent('#схлопнуть'));
проверка('у закреплённой нет крестика',
         await popup.locator('.группа .пункт').first().locator('.закрыть').count() === 0);

await popup.click('#схлопнуть');
await popup.waitForTimeout(1200);
const осталось = await sw.evaluate(() => chrome.tabs.query({ url: 'https://redmine.test/*' })
  .then(вс => вс.map(в => ({ url: в.url, pinned: в.pinned }))));
проверка('закреплённая пережила схлопывание',
         осталось.some(в => в.pinned && в.url.includes('/777')), JSON.stringify(осталось));
проверка('от тикета 777 осталась одна вкладка',
         осталось.filter(в => в.url.includes('/777')).length === 1, JSON.stringify(осталось));
проверка('тикет 888 не тронут', осталось.some(в => в.url.includes('/888')));
const значок2 = await sw.evaluate(() => chrome.action.getBadgeText({}));
проверка('значок обнулился', значок2 === '', `значок = "${значок2}"`);

// ── Настройка «тикеты по номеру» действительно влияет ──────────────────────
for (const а of ['https://redmine.test/issues/555', 'https://redmine.test/issues/555/edit']) {
  const p = await ctx.newPage(); await p.goto(а);
}
await popup.reload(); await popup.waitForTimeout(900);
проверка('с включённой настройкой /555 и /555/edit - один тикет',
         (await popup.textContent('#итог-вкладки')).startsWith('1 лишних'),
         await popup.textContent('#итог-вкладки'));

await popup.click('nav.вкл button[data-раздел="настройки"]');
await popup.uncheck('#н-тикеты');
await popup.waitForTimeout(900);
await popup.click('nav.вкл button[data-раздел="вкладки"]');
проверка('с выключенной - разные адреса',
         (await popup.textContent('#итог-вкладки')).startsWith('Дублей нет'),
         await popup.textContent('#итог-вкладки'));
await popup.click('nav.вкл button[data-раздел="настройки"]');
await popup.check('#н-тикеты');
await popup.waitForTimeout(700);

// ── Закладки во вложенных папках ───────────────────────────────────────────
const папка = await sw.evaluate(async () => {
  const корень = await chrome.bookmarks.create({ parentId: '1', title: 'Тикеты' });
  const внутри = await chrome.bookmarks.create({ parentId: корень.id, title: 'Старое' });
  await chrome.bookmarks.create({ parentId: корень.id, title: '777 наверху', url: 'https://redmine.test/issues/777' });
  await chrome.bookmarks.create({ parentId: внутри.id, title: '777 в подпапке', url: 'https://redmine.test/issues/777?tab=history' });
  await chrome.bookmarks.create({ parentId: внутри.id, title: '999', url: 'https://redmine.test/issues/999' });
  return корень.id;
});
await popup.reload(); await popup.waitForTimeout(800);
await popup.click('nav.вкл button[data-раздел="закладки"]');
await popup.selectOption('#папка', папка);
await popup.click('#искать');
await popup.waitForTimeout(700);
проверка('дубль найден через вложенную папку',
         (await popup.textContent('#итог-закладки')).startsWith('1 лишних'),
         await popup.textContent('#итог-закладки'));
await popup.click('#убрать');
await popup.waitForTimeout(900);
проверка('после переноса чисто',
         (await popup.textContent('#итог-закладки')).startsWith('Дублей нет'),
         await popup.textContent('#итог-закладки'));
const где = await sw.evaluate(async (id) => {
  const [у] = await chrome.bookmarks.getSubTree(id);
  const плоско = [];
  const идти = (n, путь) => (n.children || []).forEach(д => д.url ? плоско.push(`${путь}/${д.title}`) : идти(д, `${путь}/${д.title}`));
  идти(у, ''); return плоско;
}, папка);
проверка('перенесена именно копия из подпапки',
         где.some(с => с.includes('Дубли') && с.includes('в подпапке')), JSON.stringify(где));
проверка('оригинал остался наверху', где.some(с => с === '/777 наверху'), JSON.stringify(где));
проверка('посторонняя закладка на месте', где.some(с => с.endsWith('/999')), JSON.stringify(где));

проверка('ошибок JS нет', ошибки.length === 0, ошибки.join(' | '));

await ctx.close();
let сбоев = 0;
for (const [имя, ок, что] of итоги) { if (!ок) сбоев++; console.log(`${ок ? 'ок  ' : 'СБОЙ'}  ${имя}${ок ? '' : '  << ' + что}`); }
console.log(сбоев ? `\nСБОЕВ: ${сбоев} из ${итоги.length}` : `\nвсе ${итоги.length} проверок пройдены`);
