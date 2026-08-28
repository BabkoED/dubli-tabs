import { chromium, РАСШ } from './окружение.mjs';
import fs from 'fs';
const итоги = [];
const проверка = (и, ок, ч='') => итоги.push([и, ок, ч]);
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/prof-'), {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${РАСШ}`, `--load-extension=${РАСШ}`],
});
let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
await ctx.route('https://redmine.test/**', r => r.fulfill({ contentType: 'text/html', body: '<h1>t</h1>' }));
for (const а of ['https://redmine.test/issues/777','https://redmine.test/issues/777#n','https://redmine.test/issues/777?tab=history']) {
  const p = await ctx.newPage(); await p.goto(а);
}
await new Promise(r => setTimeout(r, 1500));
проверка('значок при открытии вкладок', await sw.evaluate(() => chrome.action.getBadgeText({})) === '2');
const цвет = await sw.evaluate(() => chrome.action.getBadgeBackgroundColor({}));
проверка('фон значка тёмный, не красный', цвет[0] === 31 && цвет[1] === 31, JSON.stringify(цвет));
проверка('будильник заведён',
  (await sw.evaluate(() => chrome.alarms.getAll())).some(a => a.name === 'пересчёт'));

// Будильник должен сам пересчитать значок, даже если событий не было вовсе.
await sw.evaluate(() => chrome.action.setBadgeText({ text: '' }));
проверка('значок стёрт для чистоты опыта',
  await sw.evaluate(() => chrome.action.getBadgeText({})) === '');
console.log('жду срабатывания будильника, до 80 секунд...');
let вернулся = '';
for (let i = 0; i < 40; i++) {
  await new Promise(r => setTimeout(r, 2000));
  вернулся = await sw.evaluate(() => chrome.action.getBadgeText({}));
  if (вернулся) break;
}
проверка('будильник сам вернул значок', вернулся === '2', `значок = "${вернулся}"`);

const вс = await sw.evaluate(() => chrome.tabs.query({}).then(в => в.map(т => т.id)));
await sw.evaluate(() => chrome.action.setBadgeText({ text: '' }));
await sw.evaluate((id) => chrome.tabs.update(id, { active: true }), вс[0]);
await new Promise(r => setTimeout(r, 1500));
проверка('переключение вкладки тоже пересчитывает',
  await sw.evaluate(() => chrome.action.getBadgeText({})) === '2');

await ctx.close();
let сбоев = 0;
for (const [и, ок, ч] of итоги) { if (!ок) сбоев++; console.log(`${ок?'ок  ':'СБОЙ'}  ${и}${ок?'':'  << '+ч}`); }
console.log(сбоев ? `\nСБОЕВ: ${сбоев}` : `\nвсе ${итоги.length} проверок пройдены`);
