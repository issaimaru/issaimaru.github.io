// Keep Blowfish's menu, with keyboard and focus handling for its overlay.
(() => {
  const button = document.getElementById("menu-button");
  const closeButton = document.getElementById("menu-close-button");
  const wrapper = document.getElementById("menu-wrapper");
  if (!button || !closeButton || !wrapper) return;

  let open = false;
  let previousOverflow = "";

  function closeMenu() {
    if (!open) return;
    open = false;
    document.body.style.overflowY = previousOverflow;
    button.style.visibility = "visible";
    button.setAttribute("aria-expanded", "false");
    wrapper.style.visibility = "hidden";
    wrapper.style.opacity = "0";
    wrapper.setAttribute("aria-hidden", "true");
    button.focus();
  }

  button.addEventListener("click", () => {
    if (open) return;
    open = true;
    previousOverflow = document.body.style.overflowY;
    document.body.style.overflowY = "hidden";
    button.style.visibility = "hidden";
    button.setAttribute("aria-expanded", "true");
    wrapper.style.visibility = "visible";
    wrapper.style.opacity = "1";
    wrapper.setAttribute("aria-hidden", "false");
    closeButton.focus();
  });

  closeButton.addEventListener("click", closeMenu);
  wrapper.addEventListener("click", event => {
    if (event.target === wrapper || event.target.closest("a")) closeMenu();
  });
  document.addEventListener("keydown", event => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    }
    if (event.key === "Tab") {
      const items = Array.from(wrapper.querySelectorAll("a[href], button")).filter(item => item.getClientRects().length);
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  window.addEventListener("resize", () => { if (window.innerWidth >= 768) closeMenu(); });
  window.addEventListener("pagehide", closeMenu);
})();
