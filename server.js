import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 6001;
const HOME = os.homedir();

const roots = [
  {
    id: "agents",
    label: "Personal: .agents",
    enabled: path.join(HOME, ".agents", "skills"),
    disabled: path.join(HOME, ".agents", "skills.disabled")
  },
  {
    id: "codex",
    label: "Personal: .codex",
    enabled: path.join(HOME, ".codex", "skills"),
    disabled: path.join(HOME, ".codex", "skills.disabled")
  }
];

const readOnlyRoots = [
  {
    id: "codex-system",
    label: "Codex system",
    base: path.join(HOME, ".codex", "skills", ".system")
  },
  {
    id: "codex-vendor",
    label: "Codex vendor",
    base: path.join(HOME, ".codex", "vendor_imports", "skills")
  }
];

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"]
]);

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function parseSkillMarkdown(markdown) {
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/);
  const block = frontmatter ? frontmatter[1] : "";
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return {
    name: name || "",
    description: description || firstParagraph(markdown)
  };
}

function firstParagraph(markdown) {
  return markdown
    .replace(/^---[\s\S]*?---/, "")
    .split(/\n\s*\n/)
    .map((part) => part.replace(/^#+\s*/gm, "").trim())
    .find(Boolean) || "";
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readSkillBase({ base, rootId, sourceLabel, state = "enabled", readonly = false }) {
  if (!(await exists(base))) return [];
  const entries = await fs.readdir(base, { withFileTypes: true });
  const skills = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const skillPath = path.join(base, entry.name);
    const skillFile = path.join(skillPath, "SKILL.md");
    if (!(await exists(skillFile))) continue;

    let meta = { name: entry.name, description: "" };
    try {
      meta = parseSkillMarkdown(await fs.readFile(skillFile, "utf8"));
    } catch {
      // Keep the skill visible even if its metadata cannot be read.
    }

    skills.push({
      id: `${rootId}:${state}:${entry.name}`,
      slug: entry.name,
      name: meta.name || entry.name,
      description: meta.description,
      source: rootId,
      sourceLabel,
      state,
      readonly,
      path: skillPath
    });
  }

  return skills.sort((a, b) => a.slug.localeCompare(b.slug));
}

async function readSkills(root, state) {
  return readSkillBase({
    base: root[state],
    rootId: root.id,
    sourceLabel: root.label,
    state
  });
}

async function findPluginSkillBases() {
  const cacheRoot = path.join(HOME, ".codex", "plugins", "cache");
  const bases = [];
  if (!(await exists(cacheRoot))) return bases;

  async function visit(current, depth) {
    if (depth > 8) return;
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "internal-skills") continue;
      const next = path.join(current, entry.name);
      if (entry.name === "skills") {
        bases.push(next);
        continue;
      }
      await visit(next, depth + 1);
    }
  }

  await visit(cacheRoot, 0);
  return bases;
}

function pluginLabel(base) {
  const relative = path.relative(path.join(HOME, ".codex", "plugins", "cache"), base);
  const parts = relative.split(path.sep).filter(Boolean);
  return parts.length > 1 ? `Plugin: ${parts.at(-3) || parts[0]}` : "Plugin";
}

async function listSkills() {
  const movableGroups = await Promise.all(
    roots.flatMap((root) => [readSkills(root, "enabled"), readSkills(root, "disabled")])
  );
  const readOnlyGroups = await Promise.all(
    readOnlyRoots.map((root) =>
      readSkillBase({
        base: root.base,
        rootId: root.id,
        sourceLabel: root.label,
        readonly: true
      })
    )
  );
  const pluginGroups = await Promise.all(
    (await findPluginSkillBases()).map((base) =>
      readSkillBase({
        base,
        rootId: `plugin:${path.relative(path.join(HOME, ".codex", "plugins", "cache"), base)}`,
        sourceLabel: pluginLabel(base),
        readonly: true
      })
    )
  );

  return [...movableGroups, ...readOnlyGroups, ...pluginGroups].flat();
}

function getRoot(source) {
  const root = roots.find((item) => item.id === source);
  if (!root) throw new Error("Unknown source");
  return root;
}

function assertSafeSlug(slug) {
  if (!/^[a-zA-Z0-9._-]+$/.test(slug) || slug === "." || slug === "..") {
    throw new Error("Invalid skill name");
  }
}

async function moveSkill({ source, slug, action }) {
  assertSafeSlug(slug);
  const root = getRoot(source);
  const fromBase = action === "disable" ? root.enabled : root.disabled;
  const toBase = action === "disable" ? root.disabled : root.enabled;
  const from = path.join(fromBase, slug);
  const to = path.join(toBase, slug);
  let conflictBackup = "";

  if (!(await exists(from))) throw new Error("Skill not found");

  await fs.mkdir(toBase, { recursive: true });
  if (await exists(to)) {
    const conflictBase = path.join(toBase, ".skills-manager-conflicts");
    conflictBackup = path.join(conflictBase, `${slug}-${Date.now()}`);
    await fs.mkdir(conflictBase, { recursive: true });
    await fs.rename(to, conflictBackup);
  }

  await fs.rename(from, to);
  return { source, slug, state: action === "disable" ? "disabled" : "enabled", conflictBackup };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function serveStatic(req, res) {
  const requested = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const filePath = requested === "/" ? "/index.html" : requested;
  const resolved = path.normalize(path.join(__dirname, "public", filePath));
  const publicRoot = path.join(__dirname, "public");

  if (!resolved.startsWith(publicRoot)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(resolved);
    res.writeHead(200, { "content-type": mimeTypes.get(path.extname(resolved)) || "text/plain" });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && url.pathname === "/api/skills") {
      json(res, 200, { skills: await listSkills() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/skills/move") {
      const result = await moveSkill(await readBody(req));
      json(res, 200, result);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    json(res, 400, { error: error.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Skills Manager running at http://127.0.0.1:${PORT}`);
});
