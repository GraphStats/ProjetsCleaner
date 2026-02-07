const fs = require("fs");
const path = require("path");
const readline = require("readline");

const TARGET_FOLDERS = new Set(["node_modules", "venv", ".venv", "env", ".env"]);
const spinnerFrames = ["|", "/", "-", "\\"];

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    })
  );
}

async function askRootDir() {
  const cwd = process.cwd();
  console.log(`Chemin courant detecte: ${cwd}`);
  const change = (await prompt("Voulez-vous saisir un autre chemin ? (o/N) : ")).trim().toLowerCase();
  const useOther = change === "o" || change === "oui" || change === "y" || change === "yes";

  let candidate = cwd;
  if (useOther) {
    const raw = (await prompt("Chemin du projet a nettoyer : ")).trim();
    const cleaned = raw.replace(/^['\"]|['\"]$/g, "");
    if (cleaned) {
      candidate = cleaned;
    }
  }

  const root = path.resolve(candidate);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.log(`Chemin invalide: ${root}`);
    return null;
  }
  console.log(`Chemin utilise: ${root}`);
  return root;
}

async function askMode() {
  console.log("Mode disponible :");
  console.log("  1) Ajouter dans .gitignore (defaut)");
  console.log("  2) Supprimer les dossiers trouves");
  const choice = (await prompt("Votre choix (1/2) : ")).trim();
  return choice === "2" ? "delete" : "gitignore";
}

function formatTime(seconds) {
  const sec = Math.max(0, Math.round(seconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h.toString().padStart(2, "0")}h${m.toString().padStart(2, "0")}m${s.toString().padStart(2, "0")}s`;
  if (m) return `${m.toString().padStart(2, "0")}m${s.toString().padStart(2, "0")}s`;
  return `${s.toString().padStart(2, "0")}s`;
}

function loadExistingEntries(filePath) {
  if (!fs.existsSync(filePath)) return new Set();
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return new Set(lines);
}

function walkTargets(rootDir) {
  const stack = [rootDir];
  const hits = [];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (TARGET_FOLDERS.has(entry.name)) {
          hits.push(path.join(current, entry.name));
        } else {
          stack.push(path.join(current, entry.name));
        }
      }
    }
  }
  return hits;
}

function makeProgressBar(percent, termWidth) {
  const suffix = ` ${percent.toFixed(1).padStart(5, " ")}%`;
  const maxBar = termWidth ? Math.max(10, Math.min(100, termWidth - suffix.length - 10)) : 20;
  const filled = Math.max(0, Math.min(maxBar, Math.round((percent / 100) * maxBar)));
  const empty = Math.max(0, maxBar - filled);
  return `[${"#".repeat(filled)}${" ".repeat(empty)}]${suffix}`;
}

function trimToWidth(text, width) {
  if (width && text.length >= width) {
    const cut = Math.max(1, width - 4);
    return text.slice(0, cut) + "...";
  }
  return text;
}

function updateStatus({ spinner, message, total, done, startTime, maxLens }) {
  const now = Date.now() / 1000;
  const elapsed = now - startTime;
  const safeTotal = total || 1;
  const percent = Math.min(100, (done / safeTotal) * 100);
  const eta = done ? (elapsed * (safeTotal - done)) / done : 0;

  const statusRaw = `${spinner} Traitement en cours | Dernier ajout : ${message.replace(/\n/g, " ")}`;

  const termWidth = process.stdout.columns || 120;
  const bar = makeProgressBar(percent, termWidth);
  const progressRaw = `${bar} | ecoule ${formatTime(elapsed)} | reste ${formatTime(eta)}`;

  const status = trimToWidth(statusRaw, termWidth);
  const progress = trimToWidth(progressRaw, termWidth);

  maxLens.status = Math.max(maxLens.status, status.length);
  maxLens.progress = Math.max(maxLens.progress, progress.length);
  const statusPad = status.padEnd(maxLens.status, " ");
  const progressPad = progress.padEnd(maxLens.progress, " ");

  const clear = "\x1b[2K";
  process.stdout.write("\x1b[2A"); // up two lines
  process.stdout.write(`\r${clear}${statusPad}\n${clear}${progressPad}\n`);
}

async function main() {
  const rootDir = await askRootDir();
  if (!rootDir) return;
  const mode = await askMode();
  const gitignorePath = path.join(rootDir, ".gitignore");

  const targets = walkTargets(rootDir);
  const total = targets.length || 1;
  const startTime = Date.now() / 1000;
  const maxLens = { status: 0, progress: 0 };

  console.log("Scan demarre");
  console.log();
  console.log();

  let existing = new Set();
  let gitignoreFd;
  if (mode === "gitignore") {
    existing = loadExistingEntries(gitignorePath);
    gitignoreFd = fs.openSync(gitignorePath, "a");
  }

  const state = {
    message: "en attente",
    done: 0,
    total,
    startTime,
    maxLens,
    spinnerIndex: 0,
  };

  const tick = () => {
    const spinner = spinnerFrames[state.spinnerIndex];
    state.spinnerIndex = (state.spinnerIndex + 1) % spinnerFrames.length;
    updateStatus({
      spinner,
      message: state.message,
      total: state.total,
      done: state.done,
      startTime: state.startTime,
      maxLens: state.maxLens,
    });
  };

  tick();
  const interval = setInterval(tick, 50);

  try {
    for (const fullPath of targets) {
      const relative = path.relative(rootDir, fullPath).split(path.sep).join("/") + "/";
      state.message = relative;

      if (mode === "gitignore") {
        if (!existing.has(relative)) {
          fs.writeSync(gitignoreFd, relative + "\n", null, "utf8");
          existing.add(relative);
        }
      } else {
        try {
          await fs.promises.rm(fullPath, { recursive: true, force: true });
        } catch {
          // ignore errors
        }
      }

      state.done += 1;
      tick();
    }
  } finally {
    clearInterval(interval);
    if (gitignoreFd) fs.closeSync(gitignoreFd);
  }

  const finalMessage =
    mode === "gitignore"
      ? state.done === 0
        ? "aucun nouveau dossier"
        : "mise a jour terminee"
      : state.done === 0
      ? "aucune suppression"
      : "suppressions terminees";

  updateStatus({
    spinner: "OK",
    message: finalMessage,
    total: state.total,
    done: state.total,
    startTime: state.startTime,
    maxLens: state.maxLens,
  });
  console.log("Scan termine");
}

main();
