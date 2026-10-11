const directory = document.querySelector(".directory-page");
if (directory) {
  const input = document.getElementById("postSearch");
  const topic = document.getElementById("postTopic");
  const sort = document.getElementById("postSort");
  const grid = document.getElementById("postGrid");
  const cards = [...grid.querySelectorAll(".post-card")];
  const count = directory.querySelector("[data-count]");
  const empty = document.getElementById("noResults");
  const pager = directory.querySelector("[data-pagination]");
  const pageStatus = directory.querySelector("[data-page-status]");
  const previous = directory.querySelector("[data-page-previous]");
  const next = directory.querySelector("[data-page-next]");
  const clear = directory.querySelector("[data-search-clear]");
  const reset = directory.querySelector("[data-filter-reset]");
  const pageSize = Number(directory.dataset.pageSize);
  const parameters = new URLSearchParams(location.search);
  let page = Math.max(1, Number.parseInt(parameters.get("page"), 10) || 1);
  input.value = (parameters.get("q") || "").slice(0, 120);
  if ([...topic.options].some(option => option.value === parameters.get("topic"))) topic.value = parameters.get("topic");
  if ([...sort.options].some(option => option.value === parameters.get("sort"))) sort.value = parameters.get("sort");

  function update(syncUrl = true, moveToResults = false) {
    const words = input.value.normalize("NFC").trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matching = cards.filter(card => (topic.value === "all" || card.dataset.topic === topic.value)
      && words.every(word => card.dataset.search.includes(word)));
    matching.sort((left, right) => {
      if (sort.value === "title") return left.dataset.title.localeCompare(right.dataset.title, "ko");
      const key = sort.value === "published" ? "published" : "updated";
      return new Date(right.dataset[key]) - new Date(left.dataset[key]) || left.dataset.title.localeCompare(right.dataset.title, "ko");
    });
    const pages = Math.max(1, Math.ceil(matching.length / pageSize));
    page = Math.min(page, pages);
    const start = (page - 1) * pageSize;
    const shown = new Set(matching.slice(start, start + pageSize));
    cards.forEach(card => { card.hidden = !shown.has(card); });
    matching.forEach(card => grid.append(card));
    count.textContent = matching.length ? `${matching.length}개 중 ${start + 1}~${Math.min(start + pageSize, matching.length)}` : "0개";
    pageStatus.textContent = matching.length ? `${page} / ${pages}` : "0 / 0";
    previous.disabled = page === 1 || !matching.length;
    next.disabled = page === pages || !matching.length;
    pager.hidden = matching.length <= pageSize;
    empty.hidden = matching.length !== 0;
    clear.hidden = input.value.length === 0;
    if (syncUrl) {
      const url = new URL(location.href);
      url.searchParams.delete("q");
      url.searchParams.delete("topic");
      url.searchParams.delete("sort");
      url.searchParams.delete("page");
      if (input.value.trim()) url.searchParams.set("q", input.value.trim());
      if (topic.value !== "all") url.searchParams.set("topic", topic.value);
      if (sort.value !== "updated") url.searchParams.set("sort", sort.value);
      if (page > 1) url.searchParams.set("page", String(page));
      history.replaceState(null, "", url);
    }
    if (moveToResults) {
      const heading = document.getElementById("directory-results");
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: "start" });
    }
  }

  input.addEventListener("input", () => { page = 1; update(); });
  topic.addEventListener("change", () => { page = 1; update(); });
  sort.addEventListener("change", () => { page = 1; update(); });
  directory.querySelector("form").addEventListener("submit", event => { event.preventDefault(); page = 1; update(true, true); });
  clear.addEventListener("click", () => { input.value = ""; page = 1; update(); input.focus(); });
  reset.addEventListener("click", () => { input.value = ""; topic.value = "all"; sort.value = "updated"; page = 1; update(); input.focus(); });
  previous.addEventListener("click", () => { page--; update(true, true); });
  next.addEventListener("click", () => { page++; update(true, true); });
  update(false);
}
