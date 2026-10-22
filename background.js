import { настройки, ключ, группыВкладок, лишниеВкладки, КАРАНТИН } from "./lib.js";

// ── Значок: сколько вкладок лишние прямо сейчас ────────────────────────────

async function обновитьЗначок() {
  const н = await настройки();
  const вкладки = await chrome.tabs.query({});
  const n = лишниеВкладки(группыВкладок(вкладки, н)).length;
  await chrome.action.setBadgeText({ text: n ? String(n) : "" });
  // Тёмный фон, а не красный: иконка сама красная, число на ней терялось.
  await chrome.action.setBadgeBackgroundColor({ color: "#1f1f1f" });
  if (chrome.action.setBadgeTextColor) {
    await chrome.action.setBadgeTextColor({ color: "#ffffff" });
  }
}

// Считаем сразу, как только фоновый процесс ожил. Chrome в третьем манифесте
// усыпляет его через полминуты; без этой строки после перезапуска браузера
// значок оставался пустым, пока Антон не тронет какую-нибудь вкладку.
обновитьЗначок();

// Будильник - на случай, когда событий нет вовсе: вкладки открыты, браузер
// стоит, процесс спит. Минута - минимальный период, который Chrome разрешает.
chrome.alarms.create("пересчёт", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((с) => {
  if (с.name === "пересчёт") обновитьЗначок();
});

// Дешёвые поводы пересчитать: переключение вкладки и окна, перенос вкладки
// между окнами. Каждый из них будит процесс и стоит одного запроса к Chrome.
chrome.tabs.onActivated.addListener(обновитьЗначок);
chrome.tabs.onAttached.addListener(обновитьЗначок);
chrome.tabs.onDetached.addListener(обновитьЗначок);
chrome.windows.onFocusChanged.addListener(обновитьЗначок);

chrome.tabs.onCreated.addListener((в) => {
  обновитьЗначок();
  перехватить(в);
});
chrome.tabs.onRemoved.addListener(обновитьЗначок);
chrome.tabs.onUpdated.addListener((_id, изм, в) => {
  if (!изм.url) return;
  обновитьЗначок();
  перехватить(в);
});
chrome.runtime.onStartup.addListener(() => {
  обновитьЗначок();
  настроитьПодсветку();
});
chrome.runtime.onInstalled.addListener(() => {
  обновитьЗначок();
  настроитьПодсветку();
});
// Только настройки. «Сложить» дважды переключает флаг «тихо» в session, а окно
// пишет выбранную папку в sync - перерегистрировать подсветку на это незачем.
chrome.storage.onChanged.addListener((изм) => {
  if (!("настройки" in изм)) return;
  обновитьЗначок();
  настроитьПодсветку();
});

// ── Не давать открыть второй раз ───────────────────────────────────────────
// Выключено по умолчанию: поведение непривычное, вкладка «исчезает» под рукой.
// Закрываем всегда более молодую - у неё больше id. Значит вкладку, которую
// Антон давно держит открытой, увести из-под него нельзя.

async function перехватить(вкладка) {
  const н = await настройки();
  if (!н.перехват || !вкладка || вкладка.pinned) return;
  const к = ключ(вкладка.url || вкладка.pendingUrl || "", н);
  if (!к) return;
  const все = await chrome.tabs.query({});
  const старшая = все.find((в) =>
    в.id !== вкладка.id && в.id < вкладка.id &&
    ключ(в.url || в.pendingUrl || "", н) === к);
  if (!старшая) return;
  try {
    await chrome.tabs.update(старшая.id, { active: true });
    await chrome.windows.update(старшая.windowId, { focused: true });
    await chrome.tabs.remove(вкладка.id);
  } catch {
    // Вкладку уже закрыл предыдущий заход: onCreated и onUpdated приходят оба.
  }
}

// ── Горячая клавиша ────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (имя) => {
  if (имя !== "collapse-duplicates") return;
  const н = await настройки();
  const лишние = лишниеВкладки(группыВкладок(await chrome.tabs.query({}), н));
  if (!лишние.length) return;
  await chrome.tabs.remove(лишние.map((в) => в.id));
  сказать("Дубли схлопнуты", `Закрыто вкладок: ${лишние.length}`);
});

// ── Закладка на уже сохранённый тикет ──────────────────────────────────────

chrome.bookmarks.onCreated.addListener(async (id, закладка) => {
  const н = await настройки();
  if (!н.предупреждать || !закладка.url) return;
  // Пока окно само раскладывает вкладки по папке, предупреждать не о чем.
  const { тихо } = await chrome.storage.session.get("тихо");
  if (тихо) return;
  const к = ключ(закладка.url, н);
  if (!к) return;
  const [корень] = await chrome.bookmarks.getTree();
  const все = [];
  const обойти = (у) => {
    for (const д of у.children || []) {
      if (д.url) все.push(д);
      else if (!КАРАНТИН.test(д.title || "")) обойти(д);
    }
  };
  обойти(корень);
  const где = все.filter((з) => з.id !== id && ключ(з.url, н) === к);
  if (!где.length) return;
  const путь = await папкаЗакладки(где[0].parentId);
  сказать("Такая закладка уже есть",
          `${где[0].title || где[0].url}\nлежит в «${путь}». Копий теперь ${где.length + 1}.`);
});

async function папкаЗакладки(id) {
  try {
    const [у] = await chrome.bookmarks.get(id);
    return у.title || "без названия";
  } catch {
    return "другой папке";
  }
}

function сказать(заголовок, текст) {
  try {
    chrome.notifications.create({
      type: "basic", iconUrl: "icon48.png", title: заголовок, message: текст,
    });
  } catch {
    // Уведомления могут быть запрещены системой - это не повод падать.
  }
}

// ── Подсветка на странице ──────────────────────────────────────────────────
// Ключи считает только фон. Контент-скрипт присылает список ссылок и получает
// ответ «эта уже открыта», чтобы правило дубля жило в одном месте - в lib.js.

chrome.runtime.onMessage.addListener((сообщение, отправитель, ответить) => {
  if (сообщение?.тип !== "проверить") return;
  (async () => {
    const н = await настройки();
    const вкладки = await chrome.tabs.query({});
    const открыто = new Set();
    for (const в of вкладки) {
      if (отправитель.tab && в.id === отправитель.tab.id) continue;
      const к = ключ(в.url || в.pendingUrl || "", н);
      if (к) открыто.add(к);
    }
    const адреса = сообщение.адреса || [];
    ответить({ занято: адреса.map((а) => открыто.has(ключ(а, н))) });
  })();
  return true; // ответ уйдёт асинхронно
});

// По одному заходу за раз. Две правки настроек подряд давали два параллельных
// захода: оба видели скрипт, оба снимали его, второй падал на «Nonexistent
// script ID» необработанной ошибкой фонового процесса. Ошибку каждого захода
// пишем в консоль сами: иначе следующий заход в цепочке её глотал.
let очередьПодсветки = Promise.resolve();
function настроитьПодсветку() {
  очередьПодсветки = очередьПодсветки.then(() =>
    перерегистрировать().catch((e) => console.warn("Подсветка:", e)));
  return очередьПодсветки;
}

async function перерегистрировать() {
  let было = [];
  try {
    было = await chrome.scripting.getRegisteredContentScripts({ ids: ["подсветка"] });
  } catch {
    было = [];
  }
  if (было.length) {
    await chrome.scripting.unregisterContentScripts({ ids: ["подсветка"] });
  }
  const н = await настройки();
  if (!н.подсветка || !н.хостПодсветки) return;
  const шаблон = `*://${н.хостПодсветки}/*`;
  // Разрешение на хост даёт Антон кнопкой в настройках. Без него не лезем.
  const есть = await chrome.permissions.contains({ origins: [шаблон] });
  if (!есть) return;
  try {
    await chrome.scripting.registerContentScripts([{
      id: "подсветка",
      matches: [шаблон],
      js: ["mark.js"],
      runAt: "document_idle",
    }]);
  } catch (e) {
    console.warn("Подсветку зарегистрировать не вышло:", e);
  }
}
