const state = {
  skills: [],
  filter: "all",
  category: "all",
  query: "",
  lang: localStorage.getItem("skills-manager-lang") || (navigator.language.startsWith("zh") ? "zh" : "en")
};

const els = {
  skills: document.querySelector("#skills"),
  categoryTabs: document.querySelector("#categoryTabs"),
  search: document.querySelector("#search"),
  enabledCount: document.querySelector("#enabledCount"),
  disabledCount: document.querySelector("#disabledCount"),
  enabledLabel: document.querySelector("#enabledLabel"),
  disabledLabel: document.querySelector("#disabledLabel"),
  scopeLabel: document.querySelector("#scopeLabel"),
  scopeMeta: document.querySelector("#scopeMeta"),
  bulkEnable: document.querySelector("#bulkEnable"),
  bulkDisable: document.querySelector("#bulkDisable"),
  toast: document.querySelector("#toast")
};

const categories = [
  { id: "all", label: { en: "All", zh: "全部" } },
  { id: "baoyu", label: { en: "Baoyu", zh: "宝玉" } },
  { id: "design", label: { en: "Design", zh: "设计" } },
  { id: "media", label: { en: "Media", zh: "媒体" } },
  { id: "finance", label: { en: "Finance", zh: "金融" } },
  { id: "tools", label: { en: "Tools", zh: "工具" } },
  { id: "other", label: { en: "Other", zh: "其他" } }
];

const copy = {
  en: {
    eyebrow: "Local Codex",
    enabled: "enabled",
    disabled: "disabled",
    filterEnabled: "Enabled",
    filterDisabled: "Disabled",
    all: "All",
    searchPlaceholder: "Search skills or functions",
    skillFilters: "Skill filters",
    skillCategories: "Skill categories",
    bulkActions: "Bulk skill actions",
    skills: "Skills",
    tableSkill: "Skill",
    tableFunction: "Function",
    tableSource: "Source",
    tableStatus: "Status",
    tableAction: "Action",
    noResults: "No skills match the current view.",
    noDescription: "No description in SKILL.md.",
    visible: "visible",
    enableVisible: "Enable disabled",
    disableVisible: "Disable enabled",
    enableTitle: (count) => `Enable the ${count} disabled skills currently visible`,
    disableTitle: (count) => `Disable the ${count} enabled skills currently visible`,
    enableThis: "Enable this",
    disableThis: "Disable this",
    moved: "moved",
    failed: "failed",
    duplicateBackedUp: "duplicate backed up",
    moveFailed: "Move failed",
    skillsChanged: (count, action) => `${count} skills ${action === "enable" ? "enabled" : "disabled"}`,
    skillChanged: (slug, action, backedUp) => {
      const verb = action === "disable" ? "disabled" : "enabled";
      return backedUp ? `${slug} ${verb}; duplicate backed up` : `${slug} ${verb}`;
    }
  },
  zh: {
    eyebrow: "本地 Codex",
    enabled: "已启用",
    disabled: "已禁用",
    filterEnabled: "已启用",
    filterDisabled: "已禁用",
    all: "全部",
    searchPlaceholder: "搜索技能或功能",
    skillFilters: "技能筛选",
    skillCategories: "技能分类",
    bulkActions: "批量技能操作",
    skills: "技能",
    tableSkill: "技能",
    tableFunction: "功能",
    tableSource: "来源",
    tableStatus: "状态",
    tableAction: "操作",
    noResults: "当前视图没有匹配的技能。",
    noDescription: "SKILL.md 中没有描述。",
    visible: "可见",
    enableVisible: "启用已禁用",
    disableVisible: "禁用已启用",
    enableTitle: (count) => `启用当前可见的 ${count} 个已禁用技能`,
    disableTitle: (count) => `禁用当前可见的 ${count} 个已启用技能`,
    enableThis: "启用",
    disableThis: "禁用",
    moved: "已移动",
    failed: "失败",
    duplicateBackedUp: "重复目录已备份",
    moveFailed: "移动失败",
    skillsChanged: (count, action) => `${count} 个技能已${action === "enable" ? "启用" : "禁用"}`,
    skillChanged: (slug, action, backedUp) => {
      const verb = action === "disable" ? "已禁用" : "已启用";
      return backedUp ? `${slug} ${verb}；重复目录已备份` : `${slug} ${verb}`;
    }
  }
};

function t(key) {
  return copy[state.lang][key];
}

function normalize(value) {
  return value.toLowerCase().trim();
}

function applyLanguage() {
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAria));
  });
  document.querySelectorAll(".languageButton").forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === state.lang);
    button.setAttribute("aria-pressed", String(button.dataset.lang === state.lang));
  });
  document.querySelector("[data-filter='all']").textContent = t("all");
  document.querySelector("[data-filter='enabled']").textContent = t("filterEnabled");
  document.querySelector("[data-filter='disabled']").textContent = t("filterDisabled");
  els.search.placeholder = t("searchPlaceholder");
  render();
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
  els.enabledLabel.textContent = t("enabled");
  els.disabledLabel.textContent = t("disabled");
  renderCategories();
  renderBulkActions(items);
  if (!items.length) {
    els.skills.innerHTML = `<div class="empty">${escapeHtml(t("noResults"))}</div>`;
    return;
  }

  els.skills.innerHTML = items.map((skill) => `
    <article class="row">
      <div class="skillName">${escapeHtml(skill.slug)}</div>
      <p class="desc">${escapeHtml(skill.description || t("noDescription"))}</p>
      <span class="pill">${escapeHtml(skill.sourceLabel)}</span>
      <span class="pill status ${skill.state === "disabled" ? "disabled" : ""}">${escapeHtml(t(skill.state))} · ${escapeHtml(categoryLabel(skill.category))}</span>
      <button class="action ${skill.state === "disabled" ? "enable" : ""}"
        type="button"
        data-source="${escapeHtml(skill.source)}"
        data-slug="${escapeHtml(skill.slug)}"
        data-action="${skill.state === "enabled" ? "disable" : "enable"}">
        ${skill.state === "enabled" ? escapeHtml(t("disableThis")) : escapeHtml(t("enableThis"))}
      </button>
    </article>
  `).join("");
}

function renderBulkActions(items) {
  const disabledVisible = items.filter((skill) => skill.state === "disabled").length;
  const enabledVisible = items.filter((skill) => skill.state === "enabled").length;
  const category = categoryLabel(state.category);
  const filter = state.filter === "all" ? "" : ` · ${t(state.filter)}`;
  const query = state.query.trim() ? ` · "${state.query.trim()}"` : "";

  els.scopeLabel.textContent = `${category}${filter}${query}`;
  els.scopeMeta.textContent = `${items.length} ${t("visible")} · ${enabledVisible} ${t("enabled")} · ${disabledVisible} ${t("disabled")}`;
  els.bulkEnable.textContent = `${t("enableVisible")} (${disabledVisible})`;
  els.bulkDisable.textContent = `${t("disableVisible")} (${enabledVisible})`;
  els.bulkEnable.title = t("enableTitle")(disabledVisible);
  els.bulkDisable.title = t("disableTitle")(enabledVisible);
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
      <span>${escapeHtml(category.label[state.lang])}</span>
      <strong>${counts.get(category.id) || 0}</strong>
    </button>
  `).join("");
}

function categoryLabel(id) {
  return categories.find((category) => category.id === id)?.label[state.lang] || categories.find((category) => category.id === "other").label[state.lang];
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
    if (!response.ok) throw new Error(data.error || t("moveFailed"));
    showToast(t("skillChanged")(payload.slug, payload.action, data.conflictBackup));
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
      if (!response.ok) throw new Error(data.error || t("moveFailed"));
      moved += 1;
    } catch (error) {
      failed.push(`${skill.slug}: ${error.message}`);
    }
  }

  await loadSkills();
  setBulkBusy(false);

  if (failed.length) {
    showToast(`${moved} ${t("moved")}, ${failed.length} ${t("failed")}`);
  } else {
    showToast(t("skillsChanged")(moved, action));
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

document.querySelector(".languageSwitch").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-lang]");
  if (!button || button.dataset.lang === state.lang) return;

  state.lang = button.dataset.lang;
  localStorage.setItem("skills-manager-lang", state.lang);
  applyLanguage();
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

applyLanguage();

loadSkills().catch((error) => {
  els.skills.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
