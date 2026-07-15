/* Margin cards, in the worldfall idiom: a marked word in the bio carries a
   small floating card (kind, title, blurb, onward link). On a mouse, resting
   on the word opens it after a beat; clicking follows the word's own link.
   On touch, the first tap previews and a second tap follows the link. */

const refs = [...document.querySelectorAll(".ref[data-card]")];
let cards = {};
try {
  cards = JSON.parse(document.getElementById("margin-cards")?.textContent || "{}");
} catch {
  cards = {};
}

if (refs.length && Object.keys(cards).length) {
  const canHover = matchMedia("(hover: hover) and (pointer: fine)").matches;

  const pop = document.createElement("div");
  pop.className = "margin-card";
  pop.setAttribute("role", "dialog");
  pop.hidden = true;
  document.body.appendChild(pop);

  let current = null;
  let hideTimer;
  let showTimer;

  /* touch has no pointer to leave, so the card gets a visible close */
  const closeButton = canHover
    ? ""
    : `<button type="button" class="margin-card-close" aria-label="Close">
         <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
           <line x1="6" y1="6" x2="18" y2="18"></line>
           <line x1="18" y1="6" x2="6" y2="18"></line>
         </svg>
       </button>`;

  function fill(slug) {
    const c = cards[slug];
    if (!c) return false;
    pop.innerHTML = `
      ${closeButton}
      <span class="margin-card-kind">${c.kind}</span>
      <span class="margin-card-title">${c.title}</span>
      <span class="margin-card-blurb">${c.blurb}</span>
      ${c.href ? `<a class="margin-card-more" href="${c.href}">${c.link} &rarr;</a>` : ""}`;
    pop.querySelector(".margin-card-close")?.addEventListener("click", (e) => {
      e.preventDefault();
      hide();
    });
    return true;
  }

  function place(ref) {
    /* measure off-screen, then anchor above or below the word with the most room */
    pop.style.left = "0px";
    pop.style.top = "0px";
    const r = ref.getBoundingClientRect();
    const margin = 10;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const pr = pop.getBoundingClientRect();
    let left = r.left + r.width / 2 - pr.width / 2;
    left = Math.max(margin, Math.min(left, vw - pr.width - margin));
    const below = r.bottom + 8;
    const above = r.top - pr.height - 8;
    let top = above < margin && below + pr.height < vh ? below : above >= margin ? above : below;
    top = Math.max(margin, Math.min(top, vh - pr.height - margin));
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  function show(ref) {
    const slug = ref.dataset.card;
    if (!slug || !fill(slug)) return;
    current = ref;
    pop.hidden = false;
    pop.classList.remove("is-open");
    place(ref);
    requestAnimationFrame(() => pop.classList.add("is-open"));
  }

  function hide() {
    current = null;
    pop.hidden = true;
    pop.classList.remove("is-open");
  }

  const clearTimers = () => {
    clearTimeout(hideTimer);
    clearTimeout(showTimer);
  };
  const scheduleHide = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 180);
  };

  for (const ref of refs) {
    if (canHover) {
      /* hover-intent delay: reading across a word doesn't pop the card */
      ref.addEventListener("mouseenter", () => {
        clearTimers();
        showTimer = setTimeout(() => show(ref), 350);
      });
      ref.addEventListener("mouseleave", () => {
        clearTimeout(showTimer);
        scheduleHide();
      });
      ref.addEventListener("focus", () => {
        clearTimers();
        show(ref);
      });
      ref.addEventListener("blur", scheduleHide);
      /* a click follows the link normally on desktop */
    } else {
      ref.addEventListener("click", (e) => {
        if (current === ref && ref.href) return; // second tap follows the link
        e.preventDefault();
        if (current === ref) hide();
        else show(ref);
      });
    }
  }

  if (canHover) {
    pop.addEventListener("mouseenter", clearTimers);
    pop.addEventListener("mouseleave", scheduleHide);
    /* the card is a rest-on-it affordance; scrolling dismisses it */
    addEventListener(
      "scroll",
      () => {
        clearTimeout(showTimer);
        if (!pop.hidden) hide();
      },
      { passive: true },
    );
  }

  document.addEventListener("click", (e) => {
    if (pop.hidden) return;
    const t = e.target;
    if (pop.contains(t) || (current && current.contains(t))) return;
    hide();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !pop.hidden) hide();
  });
}
