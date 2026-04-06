import { join, dirname, resolve } from "path";
import { existsSync, mkdirSync, readdirSync, cpSync, writeFileSync } from "fs";
import type { AppStatus, EnvStatus, OpenClawConfig, ModelProvider, ConfiguredModel } from "../shared/rpc-types";

// Re-export so existing imports from RuntimeManager still work
export type { AppStatus, EnvStatus };

// ─── 常量 ────────────────────────────────────────────────────────────────────

const GH_PROXY = "https://cdn.gh-proxy.org/";
const BUN_RELEASE_BASE = "https://github.com/oven-sh/bun/releases/download/";
const BUN_REGISTRY = "https://mirrors.huaweicloud.com/repository/npm/";

// OpenClaw gateway 默认监听端口
const OPENCLAW_PORT = 18789;

// 固定 token
const GATEWAY_TOKEN = "vh-claw";

// ─── 类型 ────────────────────────────────────────────────────────────────────

export type ProgressCallback = (message: string, percent: number) => void;
export type LogCallback = (text: string, level: "info" | "error") => void;

// ─── 内部状态 ─────────────────────────────────────────────────────────────────

let _status: AppStatus = "uninitialized";
let _openclawProcess: ReturnType<typeof Bun.spawn> | null = null;
let _startingTimer: ReturnType<typeof setTimeout> | null = null;

// ─── 路径计算 ─────────────────────────────────────────────────────────────────

/**
 * electrobun 打包后 bun 可执行文件的绝对路径。
 *
 * electrobun 实际结构（Windows 和 Mac 相同层级）：
 *   Windows : <root>/bin/bun.exe      ← process.execPath
 *   Mac     : <root>/MacOS/bun        ← process.execPath（在 .app 包内）
 *
 * process.execPath 是 Bun 运行时自身的绝对路径，始终可靠。
 */
export function getBunBinary(): string {
  return process.execPath;
}

/**
 * bun 可执行文件所在目录（绝对路径）。
 *
 *   Windows : <root>/bin/
 *   Mac     : <root>/MacOS/  (在 .app 包内)
 */
export function getBasePath(): string {
  return dirname(process.execPath);
}

/**
 * U 盘根目录（config/.openclaw/ 的父目录）。
 *
 * electrobun 打包结构：
 *   Windows : <U盘>/bin/bun.exe
 *             → getBasePath() = <U盘>/bin
 *             → ".."          = <U盘>/          ✅
 *
 *   Mac     : <U盘>/VH-Claw.app/Contents/MacOS/bun
 *             → getBasePath() = <U盘>/VH-Claw.app/Contents/MacOS
 *             → "../../.."    = <U盘>/           ✅
 */
export function getSharedRoot(): string {
  const base = getBasePath();
  if (process.platform === "darwin") {
    // 上溯三层：MacOS → Contents → *.app → U盘根
    return resolve(join(base, "..", "..", ".."));
  }
  // Windows：bin/ 的父目录即为 U 盘根
  return resolve(join(base, ".."));
}

/**
 * openclaw 安装目录（node_modules 所在）。
 * 各平台独立安装在自身可执行文件目录下：
 *   Windows : <U盘>/bin/data/openclaw/
 *   Mac     : <U盘>/VH-Claw.app/Contents/MacOS/data/openclaw/
 */
export function getOpenClawDir(): string {
  return join(getBasePath(), "data", "openclaw");
}

/**
 * openclaw 全局配置目录。
 * 放在 U 盘根目录下的 config/.openclaw/，
 * Windows 和 Mac 挂载同一 U 盘时共享同一份配置。
 */
export function getStateDir(): string {
  return join(getSharedRoot(), "config", ".openclaw");
}

/** openclaw 配置文件路径 */
export function getConfigFilePath(): string {
  return join(getStateDir(), "openclaw.json");
}

export function getLogDir(): string {
  return join(getBasePath(), "data", "logs");
}

/**
 * 获取 U 盘（共享根目录所在磁盘）的剩余空间，返回格式化字符串如 "12.3 GB"。
 * 使用 Node.js fs.statfs（Bun 原生支持），跨平台可靠。
 */
export async function getDiskFreeSpace(): Promise<string> {
  try {
    const { statfs } = await import("node:fs/promises");
    const root = getSharedRoot();
    const stats = await statfs(root);
    const free = stats.bfree * stats.bsize;
    return formatBytes(free);
  } catch { /* ignore */ }
  return "未知";
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + " GB";
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + " MB";
  return (bytes / 1024).toFixed(0) + " KB";
}

// ─── 环境检测 ─────────────────────────────────────────────────────────────────

export async function checkEnvironment(): Promise<EnvStatus> {
  const bunExists = existsSync(getBunBinary());

  // openclaw 安装后 node_modules/openclaw 目录存在，且飞书插件依赖已安装
  const openclawInstalled =
    existsSync(join(getOpenClawDir(), "package.json")) &&
    existsSync(join(getOpenClawDir(), "node_modules", "openclaw")) &&
    existsSync(join(getOpenClawDir(), "node_modules", "@larksuiteoapi", "node-sdk"));

  const status: EnvStatus = { bunExists, openclawInstalled };

  if (!bunExists || !openclawInstalled) {
    _status = "uninitialized";
  } else if (_status === "uninitialized") {
    _status = "stopped";
  }

  return status;
}

// ─── 下载 Bun 二进制 ──────────────────────────────────────────────────────────

function getBunDownloadInfo(): { url: string; filename: string } {
  const platform = process.platform;
  const arch = process.arch;

  const fileMap: Record<string, string> = {
    "win32-x64": "bun-windows-x64.zip",
    "win32-arm64": "bun-windows-aarch64.zip",
    "darwin-x64": "bun-darwin-x64.zip",
    "darwin-arm64": "bun-darwin-aarch64.zip",
  };

  const key = `${platform}-${arch}`;
  const filename = fileMap[key] ?? "bun-darwin-x64.zip";

  const version = "bun-v1.3.11";
  const rawUrl = `${BUN_RELEASE_BASE}${version}/${filename}`;
  const url = `${GH_PROXY}${rawUrl}`;

  return { url, filename };
}

export async function downloadBun(onProgress: ProgressCallback): Promise<void> {
  const runtimeDir = getBasePath();
  mkdirSync(runtimeDir, { recursive: true });

  const { url, filename } = getBunDownloadInfo();
  onProgress(`正在下载 Bun: ${filename}`, 0);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载 Bun 失败: ${response.status} ${response.statusText}`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  const zipPath = join(runtimeDir, filename);

  // 收集所有数据到内存，报告进度，最后一次性写入（避免 Windows 文件句柄占用）
  const chunks: Uint8Array[] = [];
  let downloaded = 0;

  for await (const chunk of response.body!) {
    chunks.push(chunk);
    downloaded += chunk.byteLength;
    const percent =
      contentLength > 0
        ? Math.round((downloaded / contentLength) * 50)
        : 0;
    onProgress(
      `下载中... ${(downloaded / 1024 / 1024).toFixed(1)} MB`,
      percent,
    );
  }

  // 合并并写入，Bun.write 会完全关闭文件句柄
  const totalBytes = chunks.reduce((s, c) => s + c.byteLength, 0);
  const buffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  await Bun.write(zipPath, buffer);

  onProgress("正在解压 Bun...", 55);

  // 用系统命令解压 zip
  if (process.platform === "win32") {
    Bun.spawnSync(
      ["powershell", "-NoProfile", "-Command",
        `Expand-Archive -Force -Path "${zipPath}" -DestinationPath "${runtimeDir}"`],
      { stdout: "inherit", stderr: "inherit" },
    );
  } else {
    Bun.spawnSync(["unzip", "-o", zipPath, "-d", runtimeDir],
      { stdout: "inherit", stderr: "inherit" },
    );
  }

  // 解压后 bun 在子目录里（如 bun-windows-x64/bun.exe），移动到 runtimeDir 根
  const extractedDirName = filename.replace(".zip", "");
  const bunSrc = join(
    runtimeDir,
    extractedDirName,
    process.platform === "win32" ? "bun.exe" : "bun",
  );
  const bunDest = getBunBinary();

  if (existsSync(bunSrc)) {
    await Bun.write(bunDest, Bun.file(bunSrc));
    // 赋予执行权限（非 Windows）
    if (process.platform !== "win32") {
      Bun.spawnSync(["chmod", "+x", bunDest]);
    }
  }

  // 清理 zip 和解压目录
  try {
    const { rmSync } = await import("fs");
    rmSync(zipPath, { force: true });
    rmSync(join(runtimeDir, extractedDirName), { recursive: true, force: true });
  } catch {
    // 清理失败不影响主流程
  }

  onProgress("Bun 安装完成", 60);
}

// ─── 安装 OpenClaw 包 ─────────────────────────────────────────────────────────

export async function installOpenClaw(
  onProgress: ProgressCallback,
): Promise<void> {
  const openclawDir = getOpenClawDir();
  mkdirSync(openclawDir, { recursive: true });

  // 如果 openclaw 安装不完整（缺少关键文件），强制删除 node_modules 重装
  const openclawMjs = join(openclawDir, "node_modules", "openclaw", "openclaw.mjs");
  const warningFilter = join(openclawDir, "node_modules", "openclaw", "dist", "warning-filter.js");
  // @larksuiteoapi/node-sdk 是飞书插件的外部依赖，缺失时也需重装
  const larkSdk = join(openclawDir, "node_modules", "@larksuiteoapi", "node-sdk");
  if (existsSync(join(openclawDir, "node_modules")) && (!existsSync(openclawMjs) || !existsSync(warningFilter) || !existsSync(larkSdk))) {
    onProgress("检测到安装不完整，正在清理旧文件...", 62);
    try {
      const { rmSync } = await import("fs");
      rmSync(join(openclawDir, "node_modules"), { recursive: true, force: true });
    } catch { /* ignore */ }
  }

  // 写入 package.json，声明 openclaw 及插件依赖
  // @larksuiteoapi/node-sdk 是 openclaw 内置飞书插件的外部依赖，需手动补充
  const pkgPath = join(openclawDir, "package.json");
  await Bun.write(
    pkgPath,
    JSON.stringify(
      {
        name: "openclaw-runtime",
        version: "1.0.0",
        dependencies: {
          openclaw: "latest",
          "@slack/web-api": "latest",
          "@sliverp/qqbot": "latest",
          "@larksuiteoapi/node-sdk": "latest",
          "@zed-industries/codex-acp": "^0.11.1",
        },
      },
      null, 2,
    ),
  );

  // 写入 bunfig.toml 配置国内镜像
  const bunfigPath = join(openclawDir, "bunfig.toml");
  await Bun.write(
    bunfigPath,
    `[install]\nregistry = "${BUN_REGISTRY}"\n`,
  );

  onProgress("正在安装 OpenClaw 及其依赖（使用国内镜像）...", 65);

  const bunBin = getBunBinary();
  // 用 bun install 确保安装 openclaw 自身的所有依赖
  const proc = Bun.spawn([bunBin, "install", "--no-progress"], {
    cwd: openclawDir,
    env: {
      ...process.env,
      BUN_CONFIG_REGISTRY: BUN_REGISTRY,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  // 实时输出安装日志
  (async () => {
    for await (const chunk of proc.stdout) {
      const line = new TextDecoder().decode(chunk).trim();
      if (line) onProgress(line, 75);
    }
  })();

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const errChunks: Uint8Array[] = [];
    for await (const chunk of proc.stderr) errChunks.push(chunk);
    const errMsg = new TextDecoder().decode(
      Buffer.concat(errChunks as unknown as Uint8Array[]),
    );
    throw new Error(`OpenClaw 安装失败（退出码 ${exitCode}）: ${errMsg}`);
  }

  // 确保 state 目录和默认配置存在
  await ensureDefaultConfig();

  // 创建 warning-filter shim（openclaw.mjs 动态 import 无 hash 路径）
  ensureWarningFilterShim(openclawDir);
  // 创建 npx shim，让 openclaw 能用 bunx 替代 npx（便携环境无 Node.js）
  ensureNpxShim(openclawDir);

  // 部署中文技能包
  onProgress("正在部署中文技能包...", 95);
  await deploySkillsCn(openclawDir);

  onProgress("OpenClaw 安装完成", 100);
}

// ─── 中文技能包部署 ───────────────────────────────────────────────────────────

/**
 * 将 src/skills-cn 中的技能复制到 openclaw 的 skills 目录。
 * 已存在的技能跳过，不覆盖用户自定义内容。
 */
export async function deploySkillsCn(openclawDir: string): Promise<number> {
  const skillsTarget = join(openclawDir, "node_modules", "openclaw", "skills");
  if (!existsSync(skillsTarget)) return 0;

  // skills-cn 相对于本文件的路径（打包后在 Resources/app/bun/ 旁边）
  // 开发时在 src/skills-cn，打包后在 Resources/app/skills-cn
  const candidates = [
    join(import.meta.dir, "..", "skills-cn"),          // 开发：src/skills-cn
    join(import.meta.dir, "..", "..", "skills-cn"),     // 打包后备选
  ];

  const skillsSrc = candidates.find(existsSync);
  if (!skillsSrc) return 0;

  let count = 0;
  try {
    const dirs = readdirSync(skillsSrc, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const dir of dirs) {
      const target = join(skillsTarget, dir);
      if (!existsSync(target)) {
        cpSync(join(skillsSrc, dir), target, { recursive: true });
        count++;
      }
    }
  } catch {
    // 部署失败不影响主流程
  }
  return count;
}

// ─── 配置管理 ─────────────────────────────────────────────────────────────────

/**
 * 确保 state 目录和默认 openclaw.json 存在。
 * 首次运行时写入含固定 token 的最小配置。
 */
export async function ensureDefaultConfig(): Promise<void> {
  const stateDir = getStateDir();
  mkdirSync(stateDir, { recursive: true });

  const configPath = getConfigFilePath();
  if (!existsSync(configPath)) {
    const defaultConfig: OpenClawConfig = {
      gateway: {
        mode: "local",
        auth: { mode: "token", token: GATEWAY_TOKEN },
      },
      meta: {
        lastTouchedVersion: "2026.4.2",
        lastTouchedAt: new Date().toISOString(),
      },
    };
    await Bun.write(configPath, JSON.stringify(defaultConfig, null, 2));
  }
}

/** 读取当前 openclaw.json 配置 */
export async function readConfig(): Promise<OpenClawConfig> {
  const configPath = getConfigFilePath();
  if (!existsSync(configPath)) {
    return {
      gateway: { mode: "local", auth: { mode: "token", token: GATEWAY_TOKEN } },
    };
  }
  try {
    const raw = await Bun.file(configPath).text();
    return JSON.parse(raw) as OpenClawConfig;
  } catch {
    return {
      gateway: { mode: "local", auth: { mode: "token", token: GATEWAY_TOKEN } },
    };
  }
}

/** 写入 openclaw.json 配置（深度合并） */
export async function writeConfig(patch: Partial<OpenClawConfig>): Promise<void> {
  const stateDir = getStateDir();
  mkdirSync(stateDir, { recursive: true });

  const existing = await readConfig();
  const merged = deepMerge(existing, patch);
  merged.meta = {
    lastTouchedVersion: merged.meta?.lastTouchedVersion ?? "2026.4.2",
    lastTouchedAt: new Date().toISOString(),
  };
  await Bun.write(getConfigFilePath(), JSON.stringify(merged, null, 2));
}

/** 配置指定模型 provider */
export async function configureModel(provider: ModelProvider): Promise<void> {
  const patch: Partial<OpenClawConfig> = {};

  if (provider.type === "zai") {
    // 智谱 GLM 使用内置 zai provider
    patch.env = { ZAI_API_KEY: provider.apiKey };
    patch.agents = {
      defaults: { model: { primary: `zai/${provider.model}` } },
    };
  } else {
    // OpenAI 兼容 provider
    patch.models = {
      mode: "merge",
      providers: {
        [provider.name]: {
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          api: "openai-completions",
          models: [{
            id: provider.model,
            name: provider.model,
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 8192,
          }],
        },
      },
    };
    patch.agents = {
      defaults: { model: { primary: `${provider.name}/${provider.model}` } },
    };
  }

  await writeConfig(patch);
}

/** provider 名称 → 显示信息映射 */
const PROVIDER_META: Record<string, { label: string; emoji: string }> = {
  deepseek:    { label: "DeepSeek",   emoji: "🔵" },
  minimax:     { label: "MiniMax",    emoji: "🟠" },
  kimi:        { label: "Kimi",       emoji: "🌙" },
  qwen:        { label: "通义千问",    emoji: "☁️" },
  doubao:      { label: "豆包",        emoji: "🫘" },
  siliconflow: { label: "硅基流动",    emoji: "💎" },
  zai:         { label: "智谱 GLM",    emoji: "🧠" },
  openai:      { label: "OpenAI",     emoji: "⚡" },
  anthropic:   { label: "Claude",     emoji: "🤖" },
  groq:        { label: "Groq",       emoji: "🚀" },
  custom:      { label: "自定义",      emoji: "🔧" },
};

/** 获取已配置的模型列表 */
export async function getConfiguredModels(): Promise<ConfiguredModel[]> {
  const cfg = await readConfig();
  const result: ConfiguredModel[] = [];
  const activeModel = cfg.agents?.defaults?.model?.primary ?? "";

  // openai-compatible providers
  const providers = cfg.models?.providers ?? {};
  for (const [name, p] of Object.entries(providers)) {
    const modelId = p.models?.[0]?.id ?? "";
    const meta = PROVIDER_META[name] ?? { label: name, emoji: "🔧" };
    result.push({
      name,
      label: meta.label,
      emoji: meta.emoji,
      model: modelId,
      baseUrl: p.baseUrl ?? "",
      active: activeModel === `${name}/${modelId}`,
      type: "openai-compatible",
    });
  }

  // zai provider（通过 env.ZAI_API_KEY 判断）
  if (cfg.env?.ZAI_API_KEY) {
    const zaiModel = activeModel.startsWith("zai/") ? activeModel.slice(4) : "glm-5";
    result.push({
      name: "zai",
      label: "智谱 GLM",
      emoji: "🧠",
      model: zaiModel,
      baseUrl: "",
      active: activeModel.startsWith("zai/"),
      type: "zai",
    });
  }

  return result;
}

/** 删除指定 provider 的配置 */
export async function deleteModel(name: string): Promise<void> {
  const cfg = await readConfig();

  if (name === "zai") {
    if (cfg.env) delete cfg.env.ZAI_API_KEY;
    if (cfg.agents?.defaults?.model?.primary?.startsWith("zai/")) {
      if (cfg.agents?.defaults?.model) cfg.agents.defaults.model.primary = undefined;
    }
  } else {
    if (cfg.models?.providers) {
      delete cfg.models.providers[name];
    }
    const primary = cfg.agents?.defaults?.model?.primary ?? "";
    if (primary.startsWith(`${name}/`)) {
      if (cfg.agents?.defaults?.model) cfg.agents.defaults.model.primary = undefined;
    }
  }

  await Bun.write(getConfigFilePath(), JSON.stringify(cfg, null, 2));
}

/** 设置激活模型 */
export async function setActiveModel(name: string, model: string): Promise<void> {
  const primary = name === "zai" ? `zai/${model}` : `${name}/${model}`;
  await writeConfig({ agents: { defaults: { model: { primary } } } });
}

function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sv = source[key];
    const tv = target[key];
    if (sv && typeof sv === "object" && !Array.isArray(sv) && tv && typeof tv === "object") {
      (result as Record<string, unknown>)[key as string] = deepMerge(tv as object, sv as object);
    } else if (sv !== undefined) {
      (result as Record<string, unknown>)[key as string] = sv;
    }
  }
  return result;
}

// ─── 完整初始化流程 ───────────────────────────────────────────────────────────

export async function initialize(onProgress: ProgressCallback): Promise<void> {
  const env = await checkEnvironment();

  if (!env.bunExists) {
    await downloadBun(onProgress);
  }

  if (!env.openclawInstalled) {
    await installOpenClaw(onProgress);
  } else {
    // 已安装，确保默认配置存在
    await ensureDefaultConfig();
  }

  _status = "stopped";
}

// ─── 进程管理 ─────────────────────────────────────────────────────────────────

export async function startOpenClaw(
  onLog: LogCallback,
  onStatusChange?: (status: AppStatus) => void,
): Promise<void> {
  if (_openclawProcess) return;

  const bunBin = getBunBinary();
  const openclawDir = getOpenClawDir();
  const stateDir = getStateDir();
  const configPath = getConfigFilePath();

  mkdirSync(getLogDir(), { recursive: true });
  mkdirSync(stateDir, { recursive: true });

  // 确保配置文件存在
  await ensureDefaultConfig();

  // 确保 warning-filter shim 和 npx shim 存在
  ensureWarningFilterShim(openclawDir);
  ensureNpxShim(openclawDir);

  const openclawMjs = join(openclawDir, "node_modules", "openclaw", "openclaw.mjs");
  const bunDir = dirname(bunBin);
  const binDir = join(openclawDir, "node_modules", ".bin");
  const existingPath = process.env.PATH ?? "";
  const sep = process.platform === "win32" ? ";" : ":";
  // 注入 bunDir 和 node_modules/.bin（含 npx shim），确保子进程能找到 bun 和 npx
  let patchedPath = existingPath;
  if (!patchedPath.includes(bunDir)) patchedPath = `${bunDir}${sep}${patchedPath}`;
  if (!patchedPath.includes(binDir)) patchedPath = `${binDir}${sep}${patchedPath}`;

  // Mac 的 lsof 在 /usr/sbin/，确保子进程能找到
  const systemPath = process.platform === "darwin"
    ? patchedPath.includes("/usr/sbin") ? patchedPath : `/usr/sbin:/usr/bin:${patchedPath}`
    : patchedPath;

  // 直接运行 openclaw.mjs，避免 `bun x` 触发 #!/usr/bin/env node shebang 查找
  // 不传 --force，避免依赖 fuser/lsof 等系统工具
  _openclawProcess = Bun.spawn(
    [
      bunBin, "run", openclawMjs,
      "gateway", "run",
      "--allow-unconfigured",
      "--port", String(OPENCLAW_PORT),
    ],
    {
      cwd: openclawDir,
      env: {
        ...process.env,
        PATH: systemPath,
        OPENCLAW_STATE_DIR: stateDir,
        OPENCLAW_CONFIG_PATH: configPath,
        // 覆盖 HOME 为 config/ 目录，使 $HOME/.openclaw = config/.openclaw
        // 与 OPENCLAW_STATE_DIR 保持一致，workspace 也落在 config/.openclaw/workspace
        HOME: join(getSharedRoot(), "config"),
        USERPROFILE: join(getSharedRoot(), "config"),
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  // 先设为 starting，等端口就绪再切换为 running
  _status = "starting";
  onStatusChange?.("starting");

  const proc = _openclawProcess;
  const stdout = proc.stdout as ReadableStream<Uint8Array>;
  const stderr = proc.stderr as ReadableStream<Uint8Array>;

  // 异步读取 stdout
  (async () => {
    for await (const chunk of stdout) {
      const text = new TextDecoder().decode(chunk).trim();
      if (text) onLog(text, "info");
    }
  })();

  // 异步读取 stderr
  (async () => {
    for await (const chunk of stderr) {
      const text = new TextDecoder().decode(chunk).trim();
      if (text) onLog(text, "error");
    }
  })();

  // 轮询端口就绪（最多等 30 秒）
  const url = `http://localhost:${OPENCLAW_PORT}`;
  let attempts = 0;
  const maxAttempts = 60;
  const poll = async () => {
    if (!_openclawProcess) return;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (res.ok || res.status < 500) {
        _status = "running";
        onStatusChange?.("running");
        return;
      }
    } catch {
      // 未就绪，继续等待
    }
    attempts++;
    if (attempts < maxAttempts) {
      _startingTimer = setTimeout(poll, 500);
    } else {
      _status = "running";
      onStatusChange?.("running");
    }
  };
  _startingTimer = setTimeout(poll, 500);

  // 监听进程退出
  _openclawProcess.exited.then((code) => {
    if (_startingTimer) { clearTimeout(_startingTimer); _startingTimer = null; }
    _openclawProcess = null;
    _status = "stopped";
    onStatusChange?.("stopped");
    onLog(`OpenClaw 进程已退出，退出码: ${code}`, "info");
  });
}

export async function stopOpenClaw(): Promise<void> {
  if (!_openclawProcess) return;
  if (_startingTimer) { clearTimeout(_startingTimer); _startingTimer = null; }

  const pid = _openclawProcess.pid;

  if (process.platform === "win32" && pid) {
    // Windows：taskkill /F /T 杀整个进程树
    Bun.spawnSync(["taskkill", "/F", "/T", "/PID", String(pid)], {
      stdout: "inherit",
      stderr: "inherit",
    });
  } else {
    _openclawProcess.kill();
  }

  // 等待退出（最多 5 秒）
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));
  await Promise.race([_openclawProcess.exited, timeout]);

  _openclawProcess = null;
  _status = "stopped";
}

// ─── Token 获取 ───────────────────────────────────────────────────────────────

/**
 * 直接读取 openclaw.json 中的 gateway.auth.token 字段。
 */
export async function getToken(): Promise<string> {
  const configPath = getConfigFilePath();
  if (!existsSync(configPath)) {
    // 配置不存在时返回默认 token
    return GATEWAY_TOKEN;
  }

  try {
    const raw = await Bun.file(configPath).text();
    const cfg = JSON.parse(raw) as OpenClawConfig;
    const token = cfg?.gateway?.auth?.token?.trim();
    if (token) return token;
  } catch {
    // ignore
  }

  return GATEWAY_TOKEN;
}

export function getStatus(): AppStatus {
  return _status;
}

export function getWebUIUrl(): string {
  return `http://localhost:${OPENCLAW_PORT}`;
}

/** 获取带 token 的 Web UI URL（直接登录） */
export async function getWebUIUrlWithToken(): Promise<string> {
  const token = await getToken();
  return `http://localhost:${OPENCLAW_PORT}/#token=${token}`;
}

// ─── warning-filter shim ──────────────────────────────────────────────────────

/**
 * openclaw.mjs 动态 import './dist/warning-filter.js'，但实际文件名带 hash。
 * 在 dist/ 目录下创建无 hash 的 shim 文件，re-export 实际文件。
 */
export function ensureWarningFilterShim(openclawDir: string): void {
  const distDir = join(openclawDir, "node_modules", "openclaw", "dist");
  if (!existsSync(distDir)) return;

  try {
    const files = readdirSync(distDir);

    // 处理 .js shim
    const shimJs = join(distDir, "warning-filter.js");
    if (!existsSync(shimJs)) {
      const actual = files.find(f => f.startsWith("warning-filter") && f.endsWith(".js") && f !== "warning-filter.js");
      if (actual) writeFileSync(shimJs, `export * from './${actual}';\n`, "utf8");
    }

    // 处理 .mjs shim（openclaw.mjs 同时尝试两个后缀）
    const shimMjs = join(distDir, "warning-filter.mjs");
    if (!existsSync(shimMjs)) {
      // 优先找 .mjs 实际文件，没有则指向 .js shim
      const actualMjs = files.find(f => f.startsWith("warning-filter") && f.endsWith(".mjs") && f !== "warning-filter.mjs");
      if (actualMjs) {
        writeFileSync(shimMjs, `export * from './${actualMjs}';\n`, "utf8");
      } else {
        // 指向 .js 版本
        writeFileSync(shimMjs, `export * from './warning-filter.js';\n`, "utf8");
      }
    }
  } catch {
    // 创建失败不影响主流程
  }
}

/**
 * 在 node_modules/.bin/ 下创建 npx shim，让 openclaw 能用 bunx 替代 npx。
 * 便携环境无 Node.js/npm，openclaw 内部调用 npx 时会失败，
 * 通过 shim 将 npx 重定向到 bun x（功能等价）。
 */
export function ensureNpxShim(openclawDir: string): void {
  const binDir = join(openclawDir, "node_modules", ".bin");
  if (!existsSync(binDir)) return;

  const bunBin = getBunBinary();

  try {
    if (process.platform === "win32") {
      // Windows：创建 npx.cmd shim
      const shimCmd = join(binDir, "npx.cmd");
      if (!existsSync(shimCmd)) {
        writeFileSync(shimCmd, `@"${bunBin}" x %*\r\n`, "utf8");
      }
    } else {
      // Mac：创建 npx shell shim
      const shimSh = join(binDir, "npx");
      if (!existsSync(shimSh)) {
        writeFileSync(shimSh, `#!/bin/sh\nexec "${bunBin}" x "$@"\n`, "utf8");
        Bun.spawnSync(["chmod", "+x", shimSh]);
      }
    }
  } catch {
    // 创建失败不影响主流程
  }
}

// ─── 内置命令执行 ─────────────────────────────────────────────────────────────

/**
 * 在 bun 进程内执行 openclaw 命令，返回 stdout/stderr/exitCode。
 * 使用已安装的 bun 和 openclaw，完全跨平台。
 */
export async function runOpenClawCommand(
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const bunBin = getBunBinary();
  const openclawDir = getOpenClawDir();
  const stateDir = getStateDir();
  const configPath = getConfigFilePath();
  const openclawMjs = join(openclawDir, "node_modules", "openclaw", "openclaw.mjs");

  if (!existsSync(openclawMjs)) {
    return { stdout: "", stderr: "OpenClaw 未安装，请先初始化环境", exitCode: 1 };
  }

  // 确保 warning-filter shim 和 npx shim 存在
  ensureWarningFilterShim(openclawDir);
  ensureNpxShim(openclawDir);

  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  env["OPENCLAW_STATE_DIR"] = stateDir;
  env["OPENCLAW_CONFIG_PATH"] = configPath;
  // 覆盖 HOME 为 config/ 目录，使 $HOME/.openclaw = config/.openclaw
  env["HOME"] = join(getSharedRoot(), "config");
  env["USERPROFILE"] = join(getSharedRoot(), "config");
  // Mac GUI 应用 PATH 不含 bun 目录，注入确保子进程能找到 bun 自身
  const bunDir = dirname(bunBin);
  const existingPath = env["PATH"] ?? "";
  if (!existingPath.includes(bunDir)) {
    env["PATH"] = `${bunDir}:${existingPath}`;
  }

  const proc = Bun.spawn([bunBin, "run", openclawMjs, ...args], {
    cwd: openclawDir,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [outChunks, errChunks] = await Promise.all([
    (async () => { const c: Uint8Array[] = []; for await (const ch of proc.stdout as ReadableStream<Uint8Array>) c.push(ch); return c; })(),
    (async () => { const c: Uint8Array[] = []; for await (const ch of proc.stderr as ReadableStream<Uint8Array>) c.push(ch); return c; })(),
  ]);

  const exitCode = await proc.exited;
  const dec = new TextDecoder();
  return {
    stdout: dec.decode(Buffer.concat(outChunks as unknown as Uint8Array[])).trim(),
    stderr: dec.decode(Buffer.concat(errChunks as unknown as Uint8Array[])).trim(),
    exitCode,
  };
}

// ─── 终端 ─────────────────────────────────────────────────────────────────────

/**
 * 打开一个预设了 openclaw 环境的终端窗口。
 * Windows: cmd.exe，PATH 包含 bun 和 openclaw node_modules/.bin
 */
export async function openTerminal(): Promise<void> {
  const { exec } = await import("child_process");
  const bunBin = getBunBinary();
  const openclawDir = getOpenClawDir();
  const stateDir = getStateDir();
  const configPath = getConfigFilePath();
  const bunDir = join(bunBin, "..");
  const binDir = join(openclawDir, "node_modules", ".bin");
  const existingPath = process.env.PATH ?? "";

  if (process.platform === "win32") {
    // 写临时 bat，设置环境变量后保持窗口
    const initCmd = [
      "@echo off",
      "title OpenClaw Terminal",
      `set "OPENCLAW_STATE_DIR=${stateDir}"`,
      `set "OPENCLAW_CONFIG_PATH=${configPath}"`,
      `set "PATH=${bunDir};${binDir};${existingPath}"`,
      "echo.",
      "echo  OpenClaw Terminal - 可直接运行 openclaw 命令",
      `echo  例如: openclaw status`,
      "echo.",
    ].join("\r\n");
    const batPath = join(stateDir, "_terminal.bat");
    await Bun.write(batPath, initCmd);
    // 用 exec 调用 start，这是在 Windows 上弹出新窗口最可靠的方式
    exec(`start cmd.exe /k "${batPath}"`);
  } else if (process.platform === "darwin") {
    const script = `export PATH='${bunDir}:${binDir}:${existingPath}'; export OPENCLAW_STATE_DIR='${stateDir}'; export OPENCLAW_CONFIG_PATH='${configPath}'; echo 'OpenClaw Terminal Ready'`;
    exec(`osascript -e 'tell application "Terminal" to do script "${script}"'`);
  }
}

// ─── PTY 交互终端 ─────────────────────────────────────────────────────────────

type PtySession = {
  proc: ReturnType<typeof import("node:child_process").spawn>;
  onData: (sessionId: string, data: string) => void;
  onExit: (sessionId: string, code: number) => void;
  cols: number;
  rows: number;
};

const _ptySessions = new Map<string, PtySession>();
let _ptyIdCounter = 0;

/**
 * 启动一个交互式子进程（PTY 模式）。
 * - Windows：spawn bun.exe，TERM=xterm-256color，stdin/stdout/stderr 管道
 * - Mac：spawn bun，TERM=xterm-256color，stdin/stdout/stderr 管道
 * 返回 sessionId，后续通过 ptyInput/ptyResize/ptyStop 控制。
 */
export async function ptyStart(
  args: string[],
  cols: number,
  rows: number,
  onData: (sessionId: string, data: string) => void,
  onExit: (sessionId: string, code: number) => void,
): Promise<string> {
  const { spawn } = await import("node:child_process");
  const sessionId = `pty-${++_ptyIdCounter}-${Date.now()}`;

  const bunBin = getBunBinary();
  const openclawDir = getOpenClawDir();
  const stateDir = getStateDir();
  const configPath = getConfigFilePath();
  const openclawMjs = join(openclawDir, "node_modules", "openclaw", "openclaw.mjs");

  // 确保 shim 存在
  ensureWarningFilterShim(openclawDir);
  ensureNpxShim(openclawDir);

  const bunDir = dirname(bunBin);
  const existingPath = process.env.PATH ?? "";
  const patchedPath = existingPath.includes(bunDir)
    ? existingPath
    : `${bunDir}:${existingPath}`;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: patchedPath,
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: configPath,
    // 覆盖 HOME 为 config/ 目录，使 $HOME/.openclaw = config/.openclaw
    HOME: join(getSharedRoot(), "config"),
    USERPROFILE: join(getSharedRoot(), "config"),
    COLUMNS: String(cols),
    LINES: String(rows),
  };

  let proc: ReturnType<typeof spawn>;

  if (process.platform === "win32") {
    // Windows：直接 spawn bun.exe，stdin/stdout/stderr 管道
    env.TERM = "xterm-256color";
    env.COLORTERM = "truecolor";
    env.FORCE_COLOR = "3";
    proc = spawn(
      bunBin,
      ["run", openclawMjs, ...args],
      {
        cwd: openclawDir,
        env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        windowsVerbatimArguments: false,
      },
    );
  } else {
    // Mac：pipe 模式，TERM=xterm-256color 保持颜色和 ANSI 序列支持
    env.TERM = "xterm-256color";
    env.COLORTERM = "truecolor";
    env.FORCE_COLOR = "3";
    proc = spawn(
      bunBin,
      ["run", openclawMjs, ...args],
      {
        cwd: openclawDir,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  }

  const dec = new TextDecoder("utf-8");

  proc.stdout?.on("data", (chunk: Buffer) => {
    onData(sessionId, dec.decode(chunk));
  });
  proc.stderr?.on("data", (chunk: Buffer) => {
    onData(sessionId, dec.decode(chunk));
  });

  proc.on("error", (err) => {
    onData(sessionId, `\r\n\x1b[91m[进程错误] ${err.message}\x1b[0m\r\n`);
  });

  proc.on("exit", (code) => {
    _ptySessions.delete(sessionId);
    onExit(sessionId, code ?? 0);
  });

  _ptySessions.set(sessionId, { proc, onData, onExit, cols, rows });
  return sessionId;
}

/** 向 PTY 进程发送输入（xterm.js 的 onData 原始字节，包含控制字符） */
export function ptyInput(sessionId: string, data: string): void {
  const session = _ptySessions.get(sessionId);
  if (!session) return;
  try {
    // 将字符串编码为 UTF-8 Buffer 写入 stdin
    session.proc.stdin?.write(Buffer.from(data, "utf-8"));
  } catch { /* stdin 可能已关闭 */ }
}

/** 调整 PTY 窗口大小 */
export function ptyResize(sessionId: string, cols: number, rows: number): void {
  const session = _ptySessions.get(sessionId);
  if (!session) return;
  session.cols = cols;
  session.rows = rows;
  // 非 Windows 发送 SIGWINCH 通知进程终端尺寸变化
  if (process.platform !== "win32") {
    try { session.proc.kill("SIGWINCH"); } catch { /* ignore */ }
  }
}

/** 停止 PTY 进程 */
export function ptyStop(sessionId: string): void {
  const session = _ptySessions.get(sessionId);
  if (!session) return;
  _ptySessions.delete(sessionId);
  try {
    if (process.platform === "win32" && session.proc.pid) {
      // Windows 需要杀整个进程树
      import("node:child_process").then(({ execSync }) => {
        try { execSync(`taskkill /F /T /PID ${session.proc.pid}`, { stdio: "ignore" }); } catch { /* ignore */ }
      });
    } else {
      session.proc.kill("SIGTERM");
    }
  } catch { /* ignore */ }
}
