// Filter the existing Blowfish cards without requesting third-party data in the browser.
(() => {
  const section = document.querySelector(".recent-articles");
  if (!section) return;
  const items = Array.from(section.querySelectorAll(".recent-item"));
  const filters = section.querySelector(".recent-source-filters");
  const buttons = Array.from(section.querySelectorAll("[data-article-source]"));
  const more = section.querySelector(".recent-more");
  const status = section.querySelector(".recent-status");
  const step = Number(section.dataset.limit) || 6;
  let source = "all";
  let limit = step;

  function update() {
    let matching = 0;
    let shown = 0;
    for (const item of items) {
      const matches = source === "all" || item.dataset.source === source;
      item.hidden = !matches || matching >= limit;
      if (matches) matching++;
      if (!item.hidden) shown++;
    }
    buttons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.articleSource === source)));
    status.textContent = `${shown} / ${matching}件`;
    more.hidden = shown >= matching;
  }

  filters.hidden = false;
  buttons.forEach(button => button.addEventListener("click", () => {
    source = button.dataset.articleSource;
    limit = step;
    update();
  }));
  more.addEventListener("click", () => {
    const firstNew = items.filter(item => (source === "all" || item.dataset.source === source) && item.hidden)[0];
    limit += step;
    update();
    firstNew?.querySelector("a")?.focus();
  });
  update();
})();
