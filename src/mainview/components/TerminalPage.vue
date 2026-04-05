<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from "vue";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

// ── Props：直接传入 RPC 函数，避免 emit 回调无法工作的问题 ──────────────────
const props = defineProps<{
  onRunCommand: (args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  onPtyStart: (args: string[], cols: number, rows: number) => Promise<string>;
  onPtyInput: (sessionId: string, data: string) => Promise<void>;
  onPtyResize: (sessionId: string, cols: number, rows: number) => Promise<void>;
  onPtyStop: (sessionId: string) => Promise<void>;
  // PTY 数据推送（每次推送为新对象引用，确保 watch 触发）
  ptyChunk?: { sessionId: string; data: string; _ts: number };
  ptyExited?: { sessionId: string; exitCode: number; _ts: number };
}>();

// ── 快捷命令（非交互式）──────────────────────────────────────────────────────
const QUICK_CMDS = [
  { label: "状态", args: ["status"] },
  { label: "版本", args: ["--version"] },
  { label: "健康检查", args: ["health"] },
  { label: "查看日志", args: ["logs", "--lines", "20"] },
  { label: "列出技能", args: ["skills", "list"] },
  { label: "列出渠道", args: ["channels", "list"] },
  { label: "帮助", args: ["--help"] },
];

// ── xterm 实例 ───────────────────────────────────────────────────────────────
const termEl = ref<HTMLElement | null>(null);
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;

// ── 状态 ─────────────────────────────────────────────────────────────────────
const input = ref("");
const isRunning = ref(false);
const sessionId = ref<string | null>(null);
const isInteractive = ref(false);
const cmdHistory = ref<string[]>([]);
const historyIdx = ref(-1);
const inputEl = ref<HTMLInputElement | null>(null);

function initTerm() {
  if (!termEl.value || term) return;
  term = new Terminal({
    theme: {
      background: "#0a0d14",
      foreground: "#e2e8f0",
      cursor: "#60a5fa",
      selectionBackground: "#3b82f640",
      black: "#1e293b",
      red: "#f87171",
      green: "#10b981",
      yellow: "#f59e0b",
      blue: "#60a5fa",
      magenta: "#a78bfa",
      cyan: "#22d3ee",
      white: "#e2e8f0",
      brightBlack: "#475569",
      brightRed: "#fca5a5",
      brightGreen: "#34d399",
      brightYellow: "#fcd34d",
      brightBlue: "#93c5fd",
      brightMagenta: "#c4b5fd",
      brightCyan: "#67e8f9",
      brightWhite: "#f8fafc",
    },
    fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.5,
    cursorBlink: true,
    convertEol: true,
    scrollback: 5000,
    allowProposedApi: true,
  });

  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());
  term.open(termEl.value);

  // 延迟 fit，确保容器已渲染
  nextTick(() => {
    fitAddon?.fit();
  });

  // 交互模式：键盘输入转发给 bun PTY
  term.onData((data) => {
    if (isInteractive.value && sessionId.value) {
      props.onPtyInput(sessionId.value, data);
    }
  });

  // 监听容器大小变化，重新 fit 并通知 PTY
  resizeObserver = new ResizeObserver(() => {
    fitAddon?.fit();
    if (isInteractive.value && sessionId.value && term) {
      props.onPtyResize(sessionId.value, term.cols, term.rows);
    }
  });
  resizeObserver.observe(termEl.value);

  term.writeln("\x1b[90mOpenClaw 内置终端 — 点击快捷按钮或在下方输入命令\x1b[0m");
  term.writeln("\x1b[90m交互式命令（如 onboard）将自动进入交互模式\x1b[0m");
  term.writeln("");
}

// ── 非交互式命令执行 ──────────────────────────────────────────────────────────
async function runCmd(args: string[]) {
  if (isRunning.value || isInteractive.value) return;
  isRunning.value = true;
  term?.writeln(`\x1b[94m$ openclaw ${args.join(" ")}\x1b[0m`);

  try {
    const result = await props.onRunCommand(args);
    if (result.stdout) {
      result.stdout.split("\n").forEach(line => {
        if (line.trim()) term?.writeln(line);
      });
    }
    if (result.stderr) {
      result.stderr.split("\n").forEach(line => {
        if (line.trim()) term?.writeln(`\x1b[91m${line}\x1b[0m`);
      });
    }
    if (result.exitCode !== 0 && !result.stdout && !result.stderr) {
      term?.writeln(`\x1b[91m退出码: ${result.exitCode}\x1b[0m`);
    }
  } catch (e) {
    term?.writeln(`\x1b[91m执行失败: ${e}\x1b[0m`);
  } finally {
    isRunning.value = false;
    term?.writeln("");
    nextTick(() => inputEl.value?.focus());
  }
}

// ── 交互式命令启动 ────────────────────────────────────────────────────────────
const INTERACTIVE_CMDS = ["onboard", "setup", "login", "auth", "configure", "init"];

async function handleSubmit() {
  const cmd = input.value.trim();
  if (!cmd || isRunning.value || isInteractive.value) return;

  cmdHistory.value.unshift(cmd);
  if (cmdHistory.value.length > 50) cmdHistory.value.pop();
  historyIdx.value = -1;
  input.value = "";

  const parts = cmd.replace(/^openclaw\s+/, "").split(/\s+/).filter(Boolean);
  const isInteractiveCmd = INTERACTIVE_CMDS.some(c => parts[0] === c);

  if (isInteractiveCmd) {
    await startInteractive(parts);
  } else {
    await runCmd(parts);
  }
}

async function startInteractive(args: string[]) {
  if (!term || !fitAddon) return;
  isRunning.value = true;
  isInteractive.value = true;
  term.writeln(`\x1b[94m$ openclaw ${args.join(" ")}\x1b[0m`);
  term.writeln(`\x1b[90m[交互模式] 使用键盘操作，按 Ctrl+C 退出\x1b[0m`);
  term.focus();

  const cols = term.cols;
  const rows = term.rows;

  try {
    const sid = await props.onPtyStart(args, cols, rows);
    if (sid) {
      sessionId.value = sid;
    } else {
      term.writeln(`\x1b[91m[错误] 无法启动交互进程\x1b[0m`);
      isInteractive.value = false;
    }
  } catch (e) {
    term.writeln(`\x1b[91m[错误] ${e}\x1b[0m`);
    isInteractive.value = false;
  } finally {
    isRunning.value = false;
  }
}

function stopInteractive() {
  if (sessionId.value) {
    props.onPtyStop(sessionId.value);
  }
  sessionId.value = null;
  isInteractive.value = false;
  isRunning.value = false;
  term?.writeln("\x1b[90m[交互模式已结束]\x1b[0m\r\n");
  nextTick(() => inputEl.value?.focus());
}

function clearTerm() {
  term?.clear();
  term?.writeln("\x1b[90mOpenClaw 内置终端\x1b[0m\r\n");
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "ArrowUp") {
    e.preventDefault();
    if (historyIdx.value < cmdHistory.value.length - 1) {
      historyIdx.value++;
      input.value = cmdHistory.value[historyIdx.value];
    }
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    if (historyIdx.value > 0) {
      historyIdx.value--;
      input.value = cmdHistory.value[historyIdx.value];
    } else {
      historyIdx.value = -1;
      input.value = "";
    }
  }
}

// ── 监听 PTY 数据推送（_ts 保证每次都是新引用，watch 必然触发）────────────────
watch(() => props.ptyChunk, (chunk) => {
  if (!chunk || !term) return;
  if (chunk.sessionId === sessionId.value) {
    term.write(chunk.data);
  }
});

watch(() => props.ptyExited, (exited) => {
  if (!exited) return;
  if (exited.sessionId === sessionId.value) {
    term?.writeln(`\r\n\x1b[90m[进程已退出，退出码: ${exited.exitCode}]\x1b[0m`);
    sessionId.value = null;
    isInteractive.value = false;
    isRunning.value = false;
    nextTick(() => inputEl.value?.focus());
  }
});

onMounted(() => {
  nextTick(() => initTerm());
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  if (sessionId.value) props.onPtyStop(sessionId.value);
  term?.dispose();
  term = null;
});
</script>

<template>
  <div class="terminal-page">
    <div class="page-header">
      <h2>OpenClaw 终端</h2>
      <p class="page-sub">在应用内执行 openclaw 命令，支持交互式操作</p>
    </div>

    <!-- 快捷命令 -->
    <div class="quick-cmds">
      <button
        v-for="cmd in QUICK_CMDS"
        :key="cmd.label"
        class="quick-btn"
        :disabled="isRunning || isInteractive"
        @click="runCmd(cmd.args)"
      >{{ cmd.label }}</button>
      <button class="quick-btn quick-btn-warn" :disabled="!isInteractive" @click="stopInteractive">停止交互</button>
      <button class="quick-btn quick-btn-clear" @click="clearTerm">清空</button>
    </div>

    <!-- xterm 输出区域 -->
    <div ref="termEl" class="xterm-container" />

    <!-- 输入区域 -->
    <div class="terminal-input-row">
      <span class="term-prompt">openclaw</span>
      <input
        ref="inputEl"
        v-model="input"
        type="text"
        class="terminal-input"
        placeholder="输入子命令，如: status 或 onboard（交互式）"
        :disabled="isRunning || isInteractive"
        @keydown.enter="handleSubmit"
        @keydown="handleKeydown"
        autofocus
      />
      <button
        class="btn btn-primary"
        :disabled="isRunning || isInteractive || !input.trim()"
        @click="handleSubmit"
      >
        <span v-if="isRunning" class="spinner" />
        {{ isRunning ? "执行中" : "执行" }}
      </button>
    </div>

    <!-- 交互模式提示 -->
    <div v-if="isInteractive" class="interactive-banner">
      <span class="ib-dot" />
      交互模式进行中 — 请在上方终端中操作，或点击"停止交互"退出
    </div>
  </div>
</template>

<style scoped>
.terminal-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.page-header {
  flex-shrink: 0;
  margin-bottom: 12px;
}
.page-header h2 {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 2px;
}
.page-sub {
  font-size: 0.8rem;
  color: var(--text2);
}

.quick-cmds {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.quick-btn {
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg2);
  color: var(--text2);
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0.15s;
}
.quick-btn:hover:not(:disabled) { background: var(--bg3); color: var(--text); border-color: var(--accent); }
.quick-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.quick-btn-clear { border-color: var(--danger); color: var(--danger); }
.quick-btn-clear:hover:not(:disabled) { background: color-mix(in srgb, var(--danger) 10%, transparent); }
.quick-btn-warn { border-color: var(--warning); color: var(--warning); }
.quick-btn-warn:hover:not(:disabled) { background: color-mix(in srgb, var(--warning) 10%, transparent); }

.xterm-container {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: 10px 10px 0 0;
  overflow: hidden;
  background: #0a0d14;
}

/* xterm.js 内部样式覆盖 */
:deep(.xterm) { height: 100%; padding: 8px; }
:deep(.xterm-viewport) { background: transparent !important; }
:deep(.xterm-screen) { background: transparent; }

.terminal-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #0a0d14;
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 10px 10px;
  padding: 10px 14px;
  flex-shrink: 0;
}

.term-prompt {
  font-family: "Cascadia Code", "Fira Code", Consolas, monospace;
  font-size: 0.82rem;
  color: #10b981;
  flex-shrink: 0;
  font-weight: 600;
}

.terminal-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #e2e8f0;
  font-family: "Cascadia Code", "Fira Code", Consolas, monospace;
  font-size: 0.82rem;
  caret-color: #60a5fa;
}
.terminal-input:disabled { opacity: 0.4; }

.btn { padding: 6px 14px; border-radius: 7px; font-size: 0.82rem; font-weight: 500; cursor: pointer; border: 1px solid transparent; display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s; }
.btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

.spinner { width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }

.interactive-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: color-mix(in srgb, var(--warning) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
  border-radius: 0 0 8px 8px;
  font-size: 0.78rem;
  color: var(--warning);
  flex-shrink: 0;
}
.ib-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--warning);
  animation: blink 1s infinite;
  flex-shrink: 0;
}
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
</style>
