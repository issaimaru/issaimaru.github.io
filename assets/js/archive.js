(() => {
  const section = document.querySelector("[data-archive]");
  if (!section) return;
  const tools = section.querySelector(".archive-tools");
  const input = tools.querySelector("input");
  const buttons = [...tools.querySelectorAll("[data-archive-filter]")];
  const items = [...section.querySelectorAll(".archive-item")];
  const more = section.querySelector(".archive-more");
  const empty = section.querySelector(".archive-empty");
  const count = section.querySelector(".archive-count");
  const step = Number(section.dataset.limit) || 8;
  let filter = "all";
  let limit = step;
  function matches(item) {
    return (filter === "all" || item.dataset.source.split("|").includes(filter)) && item.dataset.search.toLocaleLowerCase().includes(input.value.trim().toLocaleLowerCase());
  }
  function update() {
    let matching = 0, shown = 0;
    items.forEach(item => {
      const match = matches(item);
      item.hidden = !match || matching >= limit;
      if (match) matching++;
      if (!item.hidden) shown++;
    });
    buttons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.archiveFilter === filter)));
    count.textContent = `${shown} / ${matching}件`;
    empty.hidden = matching > 0;
    more.hidden = shown >= matching;
  }
  buttons.forEach(button => button.addEventListener("click", () => { filter = button.dataset.archiveFilter; limit = step; update(); }));
  input.addEventListener("input", () => { limit = step; update(); });
  more.addEventListener("click", () => {
    const first = items.find(item => item.hidden && matches(item));
    limit += step; update(); first?.querySelector("a")?.focus();
  });
  section.querySelector(".archive-clear").addEventListener("click", () => { input.value = ""; filter = "all"; limit = step; update(); input.focus(); });
  tools.hidden = false;
  update();
})();
