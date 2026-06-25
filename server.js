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
    label: ".agents",
    enabled: path.join(HOME, ".agents", "skills"),
    disabled: path.join(HOME, ".agents", "skills.disabled")
  },
  {
    id: "codex",
    label: ".codex",
    enabled: path.join(HOME, ".codex", "skills"),
    disabled: path.join(HOME, ".codex", "skills.disabled")
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

async function readSkills(root, state) {
  const base = root[state];
  if (!(await exists(base))) return [];
  const entries = await fs.readdir(base, { withFileTypes: true });
  const skills = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".system") continue;
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
      id: `${root.id}:${state}:${entry.name}`,
      slug: entry.name,
      name: meta.name || entry.name,
      description: meta.description,
      source: root.id,
      sourceLabel: root.label,
      state,
      path: skillPath
    });
  }

  return skills.sort((a, b) => a.slug.localeCompare(b.slug));
}

async function listSkills() {
  const groups = await Promise.all(
    roots.flatMap((root) => [readSkills(root, "enabled"), readSkills(root, "disabled")])
  );
  return groups.flat();
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

  if (!(await exists(from))) throw new Error("Skill not found");
  if (await exists(to)) throw new Error("Target already exists");

  await fs.mkdir(toBase, { recursive: true });
  await fs.rename(from, to);
  return { source, slug, state: action === "disable" ? "disabled" : "enabled" };
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
