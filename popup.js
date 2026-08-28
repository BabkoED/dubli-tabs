import {
  настройки, сохранить, лишних, группыВкладок, группыЗакладок, лишниеВкладки,
  ключ, заголовок, номерТикета, ПО_УМОЛЧАНИЮ, КАРАНТИН,
} from "./lib.js";

const ВСЕ = "ВСЕ"; // особое значение в списке папок

const $ = (сел) => document.querySelector(сел);
let н = { ...ПО_УМОЛЧАНИЮ };

// ── Разделы ────────────────────────────────────────────────────────────────

document.querySelectorAll("nav.вкл button").forEach((кн) => {
  кн.addEventListener("click", () => {
    document.querySelectorAll("nav.вкл button").forEach((б) => б.classList.remove("активна"));
    кн.classList.add("активна");
    for (const имя of ["вкладки", "закладки", "настройки"]) {
      $("#" + имя).hidden = имя !== кн.dataset.раздел;
    }
  });
});

// ── Вкладки ────────────────────────────────────────────────────────────────

let вкладочныеГруппы = [];

async function показатьВкладки() {
  const вкладки = await chrome.tabs.query({});
  вкладочныеГруппы = группыВкладок(вкладки, н);
  const лишние = лишниеВкладки(вкладочныеГруппы).length;
  $("#итог-вкладки").textContent = лишние
    ? `${лишние} лишних в ${вкладочныеГруппы.length} группах`
    : `Дублей нет. Открыто вкладок: ${вкладки.length}`;
  $("#схлопнуть").disabled = !лишние;
  $("#схлопнуть").textContent = лишние ? `Схлопнуть все (${лишние})` : "Схлопнуть все";

  const куда = $("#список-вкладки");
  куда.textContent = "";
  for (const г of вкладочныеГруппы) {
    куда.appendChild(нарисоватьГруппу(г, {
      подпись: (в) => в.title || в.url,
      лишние: (гр) => гр.список.slice(1).filter((в) => !в.pinned),
      открыть: async (в) => {
        await chrome.tabs.update(в.id, { active: true });
        await chrome.windows.update(в.windowId, { focused: true });
        window.close();
      },
      убрать: async (список) => {
        await chrome.tabs.remove(список.map((в) => в.id));
        await показатьВкладки();
      },
    }));
  }
}

$("#схлопнуть").addEventListener("click", async () => {
  const лишние = лишниеВкладки(вкладочныеГруппы);
  if (!лишние.length) return;
  await chrome.tabs.remove(лишние.map((в) => в.id));
  await показатьВкладки();
});

// ── Общий вид группы ───────────────────────────────────────────────────────

function нарисоватьГруппу(г, действия) {
  const блок = document.createElement("div");
  блок.className = "группа";

  const шапка = document.createElement("div");
  шапка.className = "шапка";
  const ключ = document.createElement("span");
  ключ.className = "ключ";
  ключ.textContent = заголовок(г);
  ключ.title = г.ключ;
  const сколько = document.createElement("span");
  сколько.className = "сколько";
  сколько.textContent = "×" + г.список.length;
  const оставить = document.createElement("button");
  оставить.className = "оставить";
  оставить.textContent = "Оставить одну";
  const лишниеВГруппе = действия.лишние ? действия.лишние(г) : г.список.slice(1);
  оставить.addEventListener("click", () => действия.убрать(лишниеВГруппе));
  оставить.disabled = !лишниеВГруппе.length;
  шапка.append(ключ, сколько, оставить);
  блок.appendChild(шапка);

  г.список.forEach((э, i) => {
    const строка = document.createElement("div");
    строка.className = "пункт" + (i === 0 ? " первый" : "");
    const имя = document.createElement("span");
    имя.className = "имя";
    имя.textContent = действия.подпись(э);
    имя.title = э.url;
    имя.addEventListener("click", () => действия.открыть(э));
    строка.appendChild(имя);
    if (i === 0 || э.pinned) {
      const метка = document.createElement("span");
      метка.className = "метка";
      // Закреплённую не закрываем ни кнопкой группы, ни «схлопнуть все».
      метка.textContent = э.pinned ? "закреплена" : "оставляем";
      строка.appendChild(метка);
    } else {
      const крест = document.createElement("button");
      крест.className = "закрыть";
      крест.textContent = "×";
      крест.title = "Убрать эту";
      крест.addEventListener("click", () => действия.убрать([э]));
      строка.appendChild(крест);
    }
    блок.appendChild(строка);
  });
  return блок;
}

// ── Закладки ───────────────────────────────────────────────────────────────

let закладочныеГруппы = [];

async function заполнитьПапки() {
  const дерево = await chrome.bookmarks.getTree();
  const папки = [];
  const обойти = (узел, путь) => {
    for (const д of узел.children || []) {
      if (д.url) continue;
      const свой = путь ? `${путь} / ${д.title}` : д.title;
      папки.push({ id: д.id, путь: свой });
      обойти(д, свой);
    }
  };
  обойти(дерево[0], "");
  const сел = $("#папка");
  сел.textContent = "";
  const всё = document.createElement("option");
  всё.value = ВСЕ;
  всё.textContent = "Все закладки";
  сел.appendChild(всё);
  for (const п of папки) {
    const о = document.createElement("option");
    о.value = п.id;
    о.textContent = п.путь;
    сел.appendChild(о);
  }
  const прошлая = await chrome.storage.sync.get("папка");
  if (прошлая.папка && папки.some((п) => п.id === прошлая.папка)) сел.value = прошлая.папка;
}

async function собрать(id) {
  const [узел] = id === ВСЕ
    ? await chrome.bookmarks.getTree()
    : await chrome.bookmarks.getSubTree(id);
  const итог = [];
  const обойти = (у, глубина) => {
    for (const д of у.children || []) {
      if (д.url) итог.push({ ...д, глубина });
      else if (!КАРАНТИН.test(д.title || "")) обойти(д, глубина + 1);
    }
  };
  обойти(узел, 0);
  return итог;
}

async function искатьВЗакладках() {
  const id = $("#папка").value;
  if (!id) return;
  await chrome.storage.sync.set({ папка: id });
  const закладки = await собрать(id);
  закладочныеГруппы = группыЗакладок(закладки, н);
  const лишние = лишних(закладочныеГруппы);
  $("#итог-закладки").textContent = лишние
    ? `${лишние} лишних в ${закладочныеГруппы.length} группах (всего закладок: ${закладки.length})`
    : `Дублей нет. Закладок в папке: ${закладки.length}`;
  $("#убрать").hidden = !лишние;
  $("#убрать").textContent = `Перенести лишние в «Дубли» (${лишние})`;

  const куда = $("#список-закладки");
  куда.textContent = "";
  for (const г of закладочныеГруппы) {
    куда.appendChild(нарисоватьГруппу(г, {
      подпись: (з) => з.title || з.url,
      открыть: async (з) => {
        await chrome.tabs.create({ url: з.url, active: true });
        window.close();
      },
      убрать: async (список) => {
        await перенести(список);
        await искатьВЗакладках();
      },
    }));
  }
}

async function перенести(список) {
  if (!список.length) return;
  // При поиске по всем закладкам складывать некуда - кладём на панель закладок.
  const корень = $("#папка").value === ВСЕ ? "1" : $("#папка").value;
  const дата = new Date().toISOString().slice(0, 10);
  const название = `Дубли ${дата}`;
  const дети = await chrome.bookmarks.getChildren(корень);
  let папка = дети.find((д) => !д.url && д.title === название);
  if (!папка) папка = await chrome.bookmarks.create({ parentId: корень, title: название });
  for (const з of список) {
    await chrome.bookmarks.move(з.id, { parentId: папка.id });
  }
}

// ── Сложить вкладки в папку и закрыть ──────────────────────────────────────
// Тот самый ручной ритуал: выкинуть дубли, сохранить, закрыть вкладки.

async function сложить() {
  const цель = $("#папка").value;
  if (!цель || цель === ВСЕ) {
    $("#итог-закладки").textContent = "Выберите настоящую папку, «Все закладки» тут не годится.";
    return;
  }
  const вкладки = (await chrome.tabs.query({})).filter((в) => !в.pinned);
  const годные = вкладки.filter((в) => {
    const к = ключ(в.url || в.pendingUrl || "", н);
    return к && (!н.толькоТикеты || номерТикета(к));
  });
  if (!годные.length) {
    $("#итог-закладки").textContent = н.толькоТикеты
      ? "Открытых тикетов нет. Если нужны любые вкладки - снимите галочку в настройках."
      : "Складывать нечего.";
    return;
  }

  // Свои же закладки не должны сыпать уведомлениями «такая уже есть».
  let отчёт = "";
  await chrome.storage.session.set({ тихо: true });
  try {
    const есть = new Set((await собрать(цель)).map((з) => ключ(з.url, н)).filter(Boolean));
    const видели = new Set();
    let сохранено = 0;
    for (const в of годные) {
      const к = ключ(в.url, н);
      if (есть.has(к) || видели.has(к)) continue;
      видели.add(к);
      await chrome.bookmarks.create({ parentId: цель, title: в.title || в.url, url: в.url });
      сохранено++;
    }
    // Окно без вкладок Chrome закрывает. Если из окна уходит всё - оставляем пустую.
    const уходит = new Map();
    for (const в of годные) уходит.set(в.windowId, (уходит.get(в.windowId) || 0) + 1);
    for (const [окно, сколько] of уходит) {
      const всего = (await chrome.tabs.query({ windowId: окно })).length;
      if (сколько >= всего) await chrome.tabs.create({ windowId: окно, url: "chrome://newtab/" });
    }
    await chrome.tabs.remove(годные.map((в) => в.id));
    отчёт = `Сохранено ${сохранено}, закрыто вкладок ${годные.length}` +
      (сохранено < годные.length ? " (дубли и уже сохранённое не повторяли)" : "");
  } finally {
    await chrome.storage.session.set({ тихо: false });
  }
  await показатьВкладки();
  await искатьВЗакладках();
  // Итог пишем последним: перерисовка списка затирает надпись.
  if (отчёт) $("#итог-закладки").textContent = отчёт;
}

$("#сложить").addEventListener("click", сложить);
$("#искать").addEventListener("click", искатьВЗакладках);
$("#убрать").addEventListener("click", async () => {
  await перенести(закладочныеГруппы.flatMap((г) => г.список.slice(1)));
  await искатьВЗакладках();
});

// ── Настройки ──────────────────────────────────────────────────────────────

function показатьНастройки() {
  $("#н-тикеты").checked = н.тикеты;
  $("#н-якорь").checked = н.безЯкоря;
  $("#н-www").checked = н.безWww;
  $("#н-мусор").value = н.мусор.join(", ");
  $("#н-подсветка").checked = н.подсветка;
  $("#н-хост").value = н.хостПодсветки;
  $("#н-перехват").checked = н.перехват;
  $("#н-предупреждать").checked = н.предупреждать;
  $("#н-только-тикеты").checked = н.толькоТикеты;
  проверитьДоступ();
}

async function собратьНастройки() {
  н = {
    ...н,
    тикеты: $("#н-тикеты").checked,
    безЯкоря: $("#н-якорь").checked,
    безWww: $("#н-www").checked,
    мусор: $("#н-мусор").value.split(",").map((с) => с.trim()).filter(Boolean),
    подсветка: $("#н-подсветка").checked,
    хостПодсветки: $("#н-хост").value.trim(),
    перехват: $("#н-перехват").checked,
    предупреждать: $("#н-предупреждать").checked,
    толькоТикеты: $("#н-только-тикеты").checked,
  };
  await сохранить(н);
  await показатьВкладки();
  проверитьДоступ();
}

for (const сел of ["#н-тикеты", "#н-якорь", "#н-www", "#н-мусор", "#н-подсветка",
                   "#н-хост", "#н-перехват", "#н-предупреждать", "#н-только-тикеты"]) {
  $(сел).addEventListener("change", собратьНастройки);
}

// chrome://extensions/shortcuts обычной ссылкой не открыть - только вкладкой.
$("#клавиши").addEventListener("click", () => {
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  window.close();
});

function шаблонХоста() {
  const хост = $("#н-хост").value.trim();
  return хост ? `*://${хост}/*` : null;
}

async function проверитьДоступ() {
  const шаблон = шаблонХоста();
  if (!шаблон) {
    $("#статус-доступа").textContent = "хост не указан";
    return;
  }
  const есть = await chrome.permissions.contains({ origins: [шаблон] });
  $("#статус-доступа").textContent = есть ? "доступ выдан" : "доступа нет";
}

$("#разрешить").addEventListener("click", async () => {
  const шаблон = шаблонХоста();
  if (!шаблон) return;
  await chrome.permissions.request({ origins: [шаблон] });
  проверитьДоступ();
});

// ── Старт ──────────────────────────────────────────────────────────────────

(async () => {
  н = await настройки();
  показатьНастройки();
  await показатьВкладки();
  await заполнитьПапки();
})();
