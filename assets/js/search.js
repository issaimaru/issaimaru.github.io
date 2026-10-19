// Use Blowfish's existing Fuse index and search modal.
(() => {
  const wrapper = document.getElementById("search-wrapper");
  const modal = document.getElementById("search-modal");
  const input = document.getElementById("search-query");
  const output = document.getElementById("search-results");
  const closeButton = document.getElementById("close-search-button");
  const status = document.getElementById("search-status");
  if (!wrapper || !modal || !input || !output || !closeButton) return;

  let fuse;
  let indexPromise;
  let visible = false;
  let opener;
  let previousOverflow = "";
  const prompt = "記事・作品のタイトルやキーワードを入力してください。";
  const announce = message => { if (status) status.textContent = message; };

  function executeQuery() {
    output.replaceChildren();
    const term = input.value.trim();
    if (!fuse) return;
    if (!term) {
      announce(prompt);
      return;
    }
    const results = fuse.search(term, { limit: 20 });
    announce(results.length ? `${results.length}件の検索結果` : "見つかりませんでした。別のキーワードを試してください。");
    for (const { item } of results) {
      const li = document.createElement("li");
      li.className = "mb-2";
      const link = document.createElement("a");
      link.className = "flex items-center px-3 py-2 rounded-md appearance-none bg-neutral-100 dark:bg-neutral-700 focus:bg-primary-100 hover:bg-primary-100 dark:hover:bg-primary-900 dark:focus:bg-primary-900";
      link.href = item.externalUrl || item.permalink;
      if (item.externalUrl) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
      const content = document.createElement("div");
      content.className = "grow min-w-0";
      const title = document.createElement("div");
      title.className = "text-lg font-bold";
      title.textContent = item.title;
      const meta = document.createElement("div");
      meta.className = "text-sm text-neutral-500 dark:text-neutral-400";
      meta.textContent = [item.section, item.date].filter(Boolean).join(" · ");
      const summary = document.createElement("div");
      summary.className = "text-sm";
      const parsed = new DOMParser().parseFromString(item.summary || "", "text/html");
      summary.textContent = (parsed.body.textContent || "").trim().slice(0, 160);
      content.append(title, meta, summary);
      link.append(content);
      li.append(link);
      output.append(li);
    }
  }

  function buildIndex() {
    if (fuse) { executeQuery(); return; }
    if (indexPromise) return;
    announce("検索データを読み込んでいます…");
    const base = wrapper.getAttribute("data-url").replace(/\/?$/, "/");
    indexPromise = fetch(base + "index.json")
      .then(response => {
        if (!response.ok) throw new Error("Search index unavailable");
        return response.json();
      })
      .then(data => {
        fuse = new Fuse(data, {
          shouldSort: true, ignoreLocation: true, threshold: 0.0,
          keys: [ { name: "title", weight: 0.8 }, { name: "section", weight: 0.2 }, { name: "summary", weight: 0.6 }, { name: "content", weight: 0.4 } ],
        });
        executeQuery();
      })
      .catch(() => {
        indexPromise = null;
        announce("検索データを読み込めませんでした。検索を開き直すと再試行できます。");
      });
  }

  function displaySearch() {
    if (visible) return;
    opener = document.activeElement;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    wrapper.style.visibility = "visible";
    wrapper.setAttribute("aria-hidden", "false");
    visible = true;
    input.focus();
    buildIndex();
  }

  function hideSearch() {
    if (!visible) return;
    visible = false;
    document.body.style.overflow = previousOverflow;
    wrapper.style.visibility = "hidden";
    wrapper.setAttribute("aria-hidden", "true");
    input.value = "";
    output.replaceChildren();
    announce(prompt);
    opener?.focus();
  }

  for (const id of ["search-button", "search-button-mobile"]) {
    document.getElementById(id)?.addEventListener("click", displaySearch);
  }
  closeButton.addEventListener("click", hideSearch);
  wrapper.addEventListener("click", event => { if (event.target === wrapper) hideSearch(); });
  input.addEventListener("input", executeQuery);
  input.closest("form")?.addEventListener("submit", event => event.preventDefault());

  document.addEventListener("keydown", event => {
    const editing = event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']");
    const menuOpen = document.getElementById("menu-button")?.getAttribute("aria-expanded") === "true";
    if (event.key === "/" && !visible && !editing && !menuOpen && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      displaySearch();
      return;
    }
    if (!visible) return;
    if (event.key === "Escape") {
      event.preventDefault();
      hideSearch();
      return;
    }
    if (event.key === "Tab") {
      const items = Array.from(modal.querySelectorAll("input, button, a[href]")).filter(item => item.getClientRects().length);
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    const links = Array.from(output.querySelectorAll("a"));
    const index = links.indexOf(document.activeElement);
    if (event.key === "ArrowDown" && links.length && (document.activeElement === input || index >= 0)) {
      event.preventDefault();
      links[Math.min(index + 1, links.length - 1)].focus();
    } else if (event.key === "ArrowUp" && index >= 0) {
      event.preventDefault();
      (index === 0 ? input : links[index - 1]).focus();
    } else if (event.key === "Enter" && document.activeElement === input && links.length) {
      event.preventDefault();
      links[0].focus();
    }
  });
})();
