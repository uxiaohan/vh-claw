<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import Electrobun from "electrobun/view";
import type {
  OpenClawRPCSchema,
  AppStatus,
  ModelProvider,
  ConfiguredModel,
} from "../shared/rpc-types";
import DashboardPage from "./components/DashboardPage.vue";
import ModelPage from "./components/ModelPage.vue";
import SkillsPage from "./components/SkillsPage.vue";
import TerminalPage from "./components/TerminalPage.vue";

// ─── RPC ─────────────────────────────────────────────────────────────────────

const rpc = Electrobun.Electroview.defineRPC<OpenClawRPCSchema>({
  maxRequestTime: Infinity,
  handlers: {
    messages: {
      statusUpdate: ({ status }) => {
        appStatus.value = status;
        if (status !== "uninitialized") isInitializing.value = false;
      },
      logLine: ({ text, level }) => {
        logs.value.push({ text, level, time: new Date().toLocaleTimeString() });
      },
      progress: ({ message, percent }) => {
        progressMsg.value = message;
        progressPct.value = percent;
      },
      ptyData: ({ sessionId, data }) => {
        ptyChunk.value = { sessionId, data, _ts: Date.now() };
      },
      ptyExit: ({ sessionId, exitCode }) => {
        ptyExited.value = { sessionId, exitCode, _ts: Date.now() };
      },
    },
  },
});

const electroview = new Electrobun.Electroview({ rpc });

// ─── 状态 ─────────────────────────────────────────────────────────────────────

const isDark = ref(true);
type Page = "dashboard" | "model" | "skills" | "terminal";
const currentPage = ref<Page>("dashboard");

const appStatus = ref<AppStatus>("uninitialized");
const isInitializing = ref(false);
const progressMsg = ref("");
const progressPct = ref(0);
const logs = ref<{ text: string; level: "info" | "error"; time: string }[]>([]);
const currentModel = ref("");
const configuredModels = ref<ConfiguredModel[]>([]);
const diskFree = ref("获取中...");

// PTY 状态（带 _ts 时间戳，确保每次推送都是新对象引用，watch 必然触发）
const ptyChunk = ref<
  { sessionId: string; data: string; _ts: number } | undefined
>();
const ptyExited = ref<
  { sessionId: string; exitCode: number; _ts: number } | undefined
>();

const statusLabel = computed(
  () =>
    ({
      uninitialized: "未初始化",
      stopped: "已停止",
      starting: "启动中",
      running: "运行中",
    })[appStatus.value] ?? appStatus.value,
);

const statusColor = computed(
  () =>
    ({
      uninitialized: "#6b7280",
      stopped: "#f59e0b",
      starting: "#3b82f6",
      running: "#10b981",
    })[appStatus.value] ?? "#6b7280",
);

// ─── 操作 ─────────────────────────────────────────────────────────────────────

async function handleInitialize() {
  isInitializing.value = true;
  progressMsg.value = "准备中...";
  progressPct.value = 0;
  logs.value = [];
  await rpc.request.initialize();
}

async function handleStart() {
  await rpc.request.start();
}
async function handleStop() {
  await rpc.request.stop();
}
async function handleOpenWebUI() {
  await rpc.request.openWebUI();
}

async function handleRunCommand(
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    return await rpc.request.runCommand({ args });
  } catch (e) {
    return { stdout: "", stderr: String(e), exitCode: 1 };
  }
}

async function handlePtyStart(
  args: string[],
  cols: number,
  rows: number,
): Promise<string> {
  try {
    const { sessionId } = await rpc.request.ptyStart({ args, cols, rows });
    return sessionId;
  } catch (e) {
    return "";
  }
}

async function handlePtyInput(sessionId: string, data: string): Promise<void> {
  await rpc.request.ptyInput({ sessionId, data });
}

async function handlePtyResize(
  sessionId: string,
  cols: number,
  rows: number,
): Promise<void> {
  await rpc.request.ptyResize({ sessionId, cols, rows });
}

async function handlePtyStop(sessionId: string): Promise<void> {
  await rpc.request.ptyStop({ sessionId });
}

async function handleSaveModel(provider: ModelProvider) {
  await rpc.request.configureModel(provider);
  currentModel.value = `${provider.name} / ${provider.model}`;
  await refreshConfiguredModels();
}

async function refreshConfiguredModels() {
  try {
    configuredModels.value = await rpc.request.getConfiguredModels();
    const active = configuredModels.value.find((m) => m.active);
    if (active) currentModel.value = `${active.name} / ${active.model}`;
  } catch {
    /* ignore */
  }
}

async function handleDeleteModel(name: string) {
  await rpc.request.deleteModel({ name });
  await refreshConfiguredModels();
}

async function handleSetActiveModel(name: string, model: string) {
  await rpc.request.setActiveModel({ name, model });
  await refreshConfiguredModels();
}

async function handleOpenUrl(url: string) {
  await rpc.request.openUrl({ url });
}

// ─── 生命周期 ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  // 禁用右键菜单
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  // 禁用 F12 / Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+U 等开发者工具快捷键
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "F12" ||
      (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j" || e.key === "C" || e.key === "c")) ||
      (e.ctrlKey && (e.key === "U" || e.key === "u"))
    ) {
      e.preventDefault();
    }
  });

  try {
    appStatus.value = await rpc.request.getStatus();
    await refreshConfiguredModels();
    diskFree.value = await rpc.request.getDiskFree();
  } catch {
    /* 等待 statusUpdate */
  }
});
</script>

<template>
  <div :class="['app', isDark ? 'dark' : 'light']">
    <!-- 侧边栏 -->
    <aside class="sidebar">
      <div class="sidebar-logo">
        <span class="logo-icon">🦞</span>
        <span class="logo-text">VH-Claw</span>
      </div>
      <nav class="sidebar-nav">
        <button
          v-for="item in [
            { id: 'dashboard', icon: '🏠', label: '控制台' },
            { id: 'model', icon: '🤖', label: '模型配置' },
            { id: 'skills', icon: '🎯', label: '技能中心' },
            { id: 'terminal', icon: '💻', label: '终端' },
          ]"
          :key="item.id"
          :class="['nav-item', currentPage === item.id && 'nav-active']"
          @click="currentPage = item.id as Page"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
        </button>
      </nav>
      <div class="sidebar-footer">
        <div class="status-row">
          <span class="status-dot" :style="{ background: statusColor }"></span>
          <span class="status-text">{{ statusLabel }}</span>
          <button
            class="theme-btn"
            @click="isDark = !isDark"
            :title="isDark ? '切换浅色' : '切换深色'"
          >
            {{ isDark ? "☀️" : "🌙" }}
          </button>
        </div>
      </div>
    </aside>

    <!-- 主内容 -->
    <main class="main-content">
      <DashboardPage
        v-if="currentPage === 'dashboard'"
        :app-status="appStatus"
        :is-initializing="isInitializing"
        :progress-msg="progressMsg"
        :progress-pct="progressPct"
        :logs="logs"
        :current-model="currentModel"
        :status-color="statusColor"
        :status-label="statusLabel"
        :disk-free="diskFree"
        @initialize="handleInitialize"
        @start="handleStart"
        @stop="handleStop"
        @open-web-u-i="handleOpenWebUI"
        @open-terminal="currentPage = 'terminal'"
        @clear-logs="logs = []"
        @open-url="handleOpenUrl"
      />
      <ModelPage
        v-else-if="currentPage === 'model'"
        :configured-models="configuredModels"
        @save="handleSaveModel"
        @open-url="handleOpenUrl"
        @delete-model="handleDeleteModel"
        @set-active-model="handleSetActiveModel"
      />
      <SkillsPage v-else-if="currentPage === 'skills'" />
      <TerminalPage
        v-else-if="currentPage === 'terminal'"
        :pty-chunk="ptyChunk"
        :pty-exited="ptyExited"
        :on-run-command="handleRunCommand"
        :on-pty-start="handlePtyStart"
        :on-pty-input="handlePtyInput"
        :on-pty-resize="handlePtyResize"
        :on-pty-stop="handlePtyStop"
      />
    </main>
  </div>
</template>

<style scoped>
/* ── 主题变量 ── */
.dark {
  --bg: #0d1117;
  --bg2: #161b22;
  --bg3: #21262d;
  --border: #30363d;
  --text: #e6edf3;
  --text2: #8b949e;
  --text3: #484f58;
  --accent: #3b82f6;
  --accent-hover: #2563eb;
  --success: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
  --info: #3b82f6;
}
.light {
  --bg: #f6f8fa;
  --bg2: #ffffff;
  --bg3: #f0f2f5;
  --border: #d0d7de;
  --text: #1f2328;
  --text2: #656d76;
  --text3: #afb8c1;
  --accent: #0969da;
  --accent-hover: #0550ae;
  --success: #1a7f37;
  --warning: #9a6700;
  --danger: #cf222e;
  --info: #0969da;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.app {
  box-sizing: border-box;
  /* padding-bottom: 38px; */
  display: flex;
  height: 100vh;
  overflow: hidden;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  background: var(--bg);
  color: var(--text);
}

/* ── 侧边栏 ── */
.sidebar {
  width: 200px;
  height: 100%;
  flex-shrink: 0;
  background: var(--bg2);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 16px 0 0;
  overflow: hidden;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  height: 36px;
  gap: 8px;
  padding: 0 16px 16px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 8px;
}
.logo-icon {
  font-size: 1.4rem;
}
.logo-text {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text);
}

.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px;
  overflow-y: auto;
  min-height: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text2);
  cursor: pointer;
  font-size: 0.88rem;
  transition: all 0.15s;
  text-align: left;
  width: 100%;
}
.nav-item:hover {
  background: var(--bg3);
  color: var(--text);
}
.nav-active {
  background: var(--accent) !important;
  color: #fff !important;
}
.nav-icon {
  font-size: 1rem;
  flex-shrink: 0;
}
.nav-label {
  font-weight: 500;
}

.sidebar-footer {
  padding: 10px 12px 12px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.78rem;
  color: var(--text2);
}

.theme-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 3px 6px;
  cursor: pointer;
  font-size: 0.85rem;
  flex-shrink: 0;
  transition: background 0.15s;
  line-height: 1;
}
.theme-btn:hover {
  background: var(--bg3);
}

.sidebar-copyright {
  font-size: 0.72rem;
  color: var(--text3);
  text-align: center;
}

/* ── 主内容 ── */
.main-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 非终端页面加 padding + 滚动 */
.main-content :deep(.page:not(.terminal-page)) {
  padding: 28px 32px;
  overflow-y: auto;
  flex: 1;
}

/* 终端页面撑满，不滚动 */
.main-content :deep(.terminal-page) {
  padding: 20px 24px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

::-webkit-scrollbar {
  width: 5px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}
</style>
