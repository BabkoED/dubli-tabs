// Помечает на странице ссылки, которые уже открыты в другой вкладке.
// Смысл: не дать открыть тикет четвёртый раз, а не разгребать потом.
(() => {
  const МЕТКА = "дубли-уже-открыт";
  if (document.getElementById("дубли-стиль")) return; // второй прогон не нужен

  const стиль = document.createElement("style");
  стиль.id = "дубли-стиль";
  стиль.textContent = `
    a.${МЕТКА} { outline: 2px solid #e67e22; outline-offset: 1px; border-radius: 3px; }
    a.${МЕТКА}::after {
      content: " уже открыт";
      font-size: 10px; color: #fff; background: #e67e22;
      border-radius: 3px; padding: 0 4px; margin-left: 4px; white-space: nowrap;
    }`;
  document.documentElement.appendChild(стиль);

  let идёт = false;

  function проверить() {
    if (идёт) return;
    const ссылки = [...document.querySelectorAll("a[href^='http']")];
    if (!ссылки.length) return;
    идёт = true;
    chrome.runtime.sendMessage(
      { тип: "проверить", адреса: ссылки.map((a) => a.href) },
      (ответ) => {
        идёт = false;
        if (chrome.runtime.lastError || !ответ) return;
        ссылки.forEach((a, i) => a.classList.toggle(МЕТКА, !!ответ.занято[i]));
      }
    );
  }

  проверить();
  // Вкладки открываются и закрываются, пока страница висит. Пересчитываем,
  // когда к ней возвращаются, и когда подгрузился новый кусок списка.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) проверить();
  });
  let таймер = null;
  new MutationObserver(() => {
    clearTimeout(таймер);
    таймер = setTimeout(проверить, 500);
  }).observe(document.body, { childList: true, subtree: true });
})();
