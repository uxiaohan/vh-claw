<script setup lang="ts">
import type { AppStatus } from "../../shared/rpc-types";
import { ref, nextTick, watch } from "vue";

const props = defineProps<{
  appStatus: AppStatus;
  isInitializing: boolean;
  progressMsg: string;
  progressPct: number;
  logs: { text: string; level: "info" | "error"; time: string }[];
  currentModel: string;
  statusColor: string;
  statusLabel: string;
  diskFree: string;
}>();

const emit = defineEmits<{
  initialize: [];
  start: [];
  stop: [];
  openWebUI: [];
  openTerminal: [];
  clearLogs: [];
  openUrl: [url: string];
}>();

const logContainer = ref<HTMLElement | null>(null);

watch(() => props.logs.length, () => {
  nextTick(() => {
    if (logContainer.value) logContainer.value.scrollTop = logContainer.value.scrollHeight;
  });
});
</script>

<template>
  <div class="page dashboard-page">
    <div class="page-header">
      <h2>控制台</h2>
      <p class="page-sub">管理 OpenClaw Gateway 服务</p>
    </div>

    <!-- 统计卡片 -->
    <div class="cards-row">
      <div class="stat-card">
        <div class="stat-icon">⚡</div>
        <div class="stat-body">
          <div class="stat-label">服务状态</div>
          <div class="stat-value" :style="{ color: statusColor }">{{ statusLabel }}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🤖</div>
        <div class="stat-body">
          <div class="stat-label">当前模型</div>
          <div class="stat-value">{{ currentModel || '未配置' }}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">💾</div>
        <div class="stat-body">
          <div class="stat-label">U盘剩余</div>
          <div class="stat-value">{{ diskFree }}</div>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="action-section">
      <button
        v-if="appStatus === 'uninitialized'"
        class="btn btn-primary btn-lg"
        :disabled="isInitializing"
        @click="emit('initialize')"
      >
        <span v-if="isInitializing" class="spinner" />
        {{ isInitializing ? "初始化中..." : "⚙️ 初始化环境" }}
      </button>

      <template v-else>
        <button v-if="appStatus === 'stopped'" class="btn btn-success btn-lg" @click="emit('start')">
          ▶ 启动 OpenClaw
        </button>
        <button v-else-if="appStatus === 'starting'" class="btn btn-info btn-lg" disabled>
          <span class="spinner" /> 启动中...
        </button>
        <button v-else class="btn btn-danger btn-lg" @click="emit('stop')">
          ■ 停止服务
        </button>

        <button class="btn btn-outline btn-lg" :disabled="appStatus !== 'running'" @click="emit('openWebUI')">
          🌐 打开 Web 界面
        </button>

        <button class="btn btn-outline btn-lg" @click="emit('openTerminal')">
          💻 打开终端
        </button>
      </template>
    </div>

    <!-- 进度条 -->
    <div v-if="isInitializing" class="progress-card">
      <div class="progress-info">
        <span>{{ progressMsg }}</span>
        <span>{{ progressPct }}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: progressPct + '%' }" />
      </div>
    </div>

    <!-- 日志 -->
    <div class="log-card">
      <div class="log-card-header">
        <span>📋 运行日志</span>
        <button class="btn-xs" @click="emit('clearLogs')">清空</button>
      </div>
      <div ref="logContainer" class="log-body">
        <div
          v-for="(log, i) in logs"
          :key="i"
          :class="['log-row', log.level === 'error' ? 'log-err' : 'log-ok']"
        >
          <span class="log-t">{{ log.time }}</span>
          <span class="log-msg">{{ log.text }}</span>
        </div>
        <div v-if="!logs.length" class="log-empty">暂无日志...</div>
      </div>
    </div>

    <!-- 版权 -->
    <div class="copyright">
      <span>© 2026</span>
      <button class="copyright-link" @click="emit('openUrl', 'https://github.com/uxiaohan/vh-claw')">vh-claw</button>
      <span>·</span>
      <span>VH-Claw - OpenClaw Portable</span>
      <span>by </span>
      <button class="copyright-link" @click="emit('openUrl', 'https://www.vvhan.com')">Han</button>
    </div>
  </div>
</template>

<style scoped>
.dashboard-page { display: flex; flex-direction: column; }
.copyright {
  margin-top: 20px;
  padding: 12px 0;
  border-top: 1px solid var(--border);
  font-size: 0.75rem;
  color: var(--text3);
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.copyright-link {
  background: none; border: none; padding: 0;
  color: var(--text2); cursor: pointer; font-size: inherit;
  font-weight: 500;
  transition: color 0.15s;
}
.copyright-link:hover { color: var(--accent); }
</style>
