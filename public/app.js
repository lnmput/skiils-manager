const state = {
  skills: [],
  filter: "all",
  category: "all",
  query: ""
};

const els = {
  skills: document.querySelector("#skills"),
  categoryTabs: document.querySelector("#categoryTabs"),
  search: document.querySelector("#search"),
  enabledCount: document.querySelector("#enabledCount"),
  disabledCount: document.querySelector("#disabledCount"),
  scopeLabel: document.querySelector("#scopeLabel"),
  scopeMeta: document.querySelector("#scopeMeta"),
  bulkEnable: document.querySelector("#bulkEnable"),
  bulkDisable: document.querySelector("#bulkDisable"),
  toast: document.querySelector("#toast")
};

const categories = [
  { id: "all", label: "All" },
  { id: "baoyu", label: "Baoyu" },
  { id: "design", label: "Design" },
  { id: "media", label: "Media" },
  { id: "finance", label: "Finance" },
  { id: "tools", label: "Tools" },
  { id: "other", label: "Other" }
];

function normalize(value) {
  return value.toLowerCase().trim();
}

function visibleSkills() {
  const query = normalize(state.query);
  return state.skills.filter((skill) => {
    const matchesFilter = state.filter === "all" || skill.state === state.filter;
    const matchesCategory = state.category === "all" || skill.category === state.category;
    const haystack = normalize(`${skill.slug} ${skill.name} ${skill.description} ${skill.sourceLabel}`);
    return matchesFilter && matchesCategory && (!query || haystack.includes(query));
  });
}

function render() {
  const enabled = state.skills.filter((skill) => skill.state === "enabled").length;
  const disabled = state.skills.filter((skill) => skill.state === "disabled").length;
  const items = visibleSkills();
  els.enabledCount.textContent = enabled;
  els.disabledCount.textContent = disabled;
  renderCategories();
  renderBulkActions(items);
  if (!items.length) {
    els.skills.innerHTML = `<div class="empty">No skills match the current view.</div>`;
    return;
  }

  els.skills.innerHTML = items.map((skill) => `
    <article class="row">
      <div class="skillName">${escapeHtml(skill.slug)}</div>
      <p class="desc">${escapeHtml(skill.description || "No description in SKILL.md.")}</p>
      <span class="pill">${escapeHtml(skill.sourceLabel)}</span>
      <span class="pill status ${skill.state === "disabled" ? "disabled" : ""}">${skill.state} · ${escapeHtml(categoryLabel(skill.category))}</span>
      <button class="action ${skill.state === "disabled" ? "enable" : ""}"
        type="button"
        data-source="${escapeHtml(skill.source)}"
        data-slug="${escapeHtml(skill.slug)}"
        data-action="${skill.state === "enabled" ? "disable" : "enable"}">
        ${skill.state === "enabled" ? "Disable this" : "Enable this"}
      </button>
    </article>
  `).join("");
}

function renderBulkActions(items) {
  const disabledVisible = items.filter((skill) => skill.state === "disabled").length;
  const enabledVisible = items.filter((skill) => skill.state === "enabled").length;
  const category = categoryLabel(state.category);
  const filter = state.filter === "all" ? "" : ` · ${state.filter}`;
  const query = state.query.trim() ? ` · "${state.query.trim()}"` : "";

  els.scopeLabel.textContent = `${category}${filter}${query}`;
  els.scopeMeta.textContent = `${items.length} visible · ${enabledVisible} enabled · ${disabledVisible} disabled`;
  els.bulkEnable.textContent = `Enable disabled (${disabledVisible})`;
  els.bulkDisable.textContent = `Disable enabled (${enabledVisible})`;
  els.bulkEnable.title = `Enable the ${disabledVisible} disabled skills currently visible`;
  els.bulkDisable.title = `Disable the ${enabledVisible} enabled skills currently visible`;
  els.bulkEnable.disabled = disabledVisible === 0;
  els.bulkDisable.disabled = enabledVisible === 0;
}

function renderCategories() {
  const counts = new Map(categories.map((category) => [category.id, 0]));
  for (const skill of state.skills) {
    counts.set("all", (counts.get("all") || 0) + 1);
    counts.set(skill.category, (counts.get(skill.category) || 0) + 1);
  }

  els.categoryTabs.innerHTML = categories.map((category) => `
    <button class="categoryTab ${state.category === category.id ? "active" : ""}"
      type="button"
      data-category="${category.id}">
      <span>${escapeHtml(category.label)}</span>
      <strong>${counts.get(category.id) || 0}</strong>
    </button>
  `).join("");
}

function categoryLabel(id) {
  return categories.find((category) => category.id === id)?.label || "Other";
}

function assignCategory(skill) {
  const slug = skill.slug.toLowerCase();
  const text = `${slug} ${skill.description}`.toLowerCase();

  if (slug.startsWith("baoyu-")) return "baoyu";
  if (/(btc|macro|liquidity|sentiment|value-investing|earnings)/.test(text)) return "finance";
  if (/(hyperframes|video|slide|youtube|image|comic|diagram|cover|webp|markdown-to-html|translate|x-to-markdown|post-to-|weibo|wechat)/.test(text)) return "media";
  if (/(design|ui|ux|layout|typography|frontend|swiftui|accessibility|metadata|motion|brand|brutalist|minimalist|stitch|image-to-code|redesign|polish|normalize|harden|onboard|color|animate|critique|bolder|quieter|adapt|clarify|delight|distill|extract|optimize)/.test(text)) return "design";
  if (/(gstack|gsap|find-skills|full-output|migrate|codex|pptx|electron|shape)/.test(text)) return "tools";
  return "other";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadSkills() {
  const response = await fetch("/api/skills");
  const data = await response.json();
  state.skills = data.skills.map((skill) => ({
    ...skill,
    category: assignCategory(skill)
  }));
  render();
}

async function moveSkill(button) {
  const payload = {
    source: button.dataset.source,
    slug: button.dataset.slug,
    action: button.dataset.action
  };

  button.disabled = true;
  try {
    const response = await fetch("/api/skills/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Move failed");
    const verb = payload.action === "disable" ? "disabled" : "enabled";
    showToast(data.conflictBackup ? `${payload.slug} ${verb}; duplicate backed up` : `${payload.slug} ${verb}`);
    await loadSkills();
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
}

async function moveVisibleSkills(action) {
  const targets = visibleSkills().filter((skill) =>
    action === "enable" ? skill.state === "disabled" : skill.state === "enabled"
  );

  if (!targets.length) return;

  setBulkBusy(true);
  let moved = 0;
  const failed = [];

  for (const skill of targets) {
    try {
      const response = await fetch("/api/skills/move", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: skill.source,
          slug: skill.slug,
          action
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Move failed");
      moved += 1;
    } catch (error) {
      failed.push(`${skill.slug}: ${error.message}`);
    }
  }

  await loadSkills();
  setBulkBusy(false);

  if (failed.length) {
    showToast(`${moved} moved, ${failed.length} failed`);
  } else {
    showToast(`${moved} skills ${action === "enable" ? "enabled" : "disabled"}`);
  }
}

function setBulkBusy(isBusy) {
  els.bulkEnable.disabled = isBusy || els.bulkEnable.disabled;
  els.bulkDisable.disabled = isBusy || els.bulkDisable.disabled;
  els.bulkEnable.classList.toggle("busy", isBusy);
  els.bulkDisable.classList.toggle("busy", isBusy);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2400);
}

document.querySelector(".segments").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;

  document.querySelectorAll(".segment").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  state.filter = button.dataset.filter;
  render();
});

els.categoryTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-category]");
  if (!button) return;

  state.category = button.dataset.category;
  render();
});

els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});

els.bulkEnable.addEventListener("click", () => {
  moveVisibleSkills("enable");
});

els.bulkDisable.addEventListener("click", () => {
  moveVisibleSkills("disable");
});

els.skills.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (button) moveSkill(button);
});

loadSkills().catch((error) => {
  els.skills.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
