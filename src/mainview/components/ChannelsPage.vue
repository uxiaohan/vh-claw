<script setup lang="ts">
import { ref, onMounted } from "vue";

const props = defineProps<{
  onSaveChannels: (channels: Record<string, unknown>) => Promise<void>;
  onGetChannels: () => Promise<Record<string, unknown>>;
  onOpenUrl: (url: string) => void;
  onRunCommand: (args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  onGoToWeixinLogin?: () => void;
}>();

// ── 微信插件状态 ──────────────────────────────────────────────────────────────
const weixinMsg = ref("");

function goToWeixinLogin() {
  if (props.onGoToWeixinLogin) {
    props.onGoToWeixinLogin();
  } else {
    weixinMsg.value = "⚠️ 请切换到「终端」页面，点击「💚 微信登录」按钮扫码授权";
    setTimeout(() => { weixinMsg.value = ""; }, 8000);
  }
}

type ChannelKey = never;

interface ChannelConfig {
  key: ChannelKey;
  icon: string;
  label: string;
  desc: string;
  docsUrl: string;
  fields: { id: string; label: string; placeholder: string; hint?: string; hintUrl?: string; hintLabel?: string }[];
}

const CHANNELS: ChannelConfig[] = [];

// 每个渠道的表单值
const formValues = ref<Record<string, Record<string, string>>>({});
// 展开状态
const expanded = ref<Record<string, boolean>>({});
// 保存状态
const saving = ref(false);
const savedMsg = ref("");

onMounted(async () => {
  // 初始化表单
  for (const ch of CHANNELS) {
    formValues.value[ch.key] = {};
    for (const f of ch.fields) formValues.value[ch.key][f.id] = "";
    expanded.value[ch.key] = false;
  }
  // 加载已有配置
  try {
    const existing = await props.onGetChannels();
    for (const ch of CHANNELS) {
      const cfg = existing[ch.key] as Record<string, unknown> | undefined;
      if (cfg) {
        expanded.value[ch.key] = true;
        for (const f of ch.fields) {
          if (cfg[f.id] !== undefined) formValues.value[ch.key][f.id] = String(cfg[f.id]);
        }
      }
    }
  } catch { /* ignore */ }
});

function toggle(key: ChannelKey) {
  expanded.value[key] = !expanded.value[key];
}

function isConfigured(key: ChannelKey): boolean {
  const ch = CHANNELS.find(c => c.key === key);
  if (!ch) return false;
  return ch.fields.every(f => !!formValues.value[key]?.[f.id]?.trim());
}

async function save() {
  saving.value = true;
  savedMsg.value = "";
  try {
    const channels: Record<string, unknown> = {};
    for (const ch of CHANNELS) {
      if (!expanded.value[ch.key]) continue;
      const vals = formValues.value[ch.key];
      const allFilled = ch.fields.every(f => !!vals[f.id]?.trim());
      if (allFilled) {
        const entry: Record<string, unknown> = { enabled: true };
        for (const f of ch.fields) entry[f.id] = vals[f.id].trim();
        channels[ch.key] = entry;
      }
    }
    await props.onSaveChannels(channels);
    savedMsg.value = "✅ 已保存，重启 OpenClaw 后生效";
  } catch (e) {
    savedMsg.value = `❌ 保存失败: ${e}`;
  } finally {
    saving.value = false;
    setTimeout(() => { savedMsg.value = ""; }, 4000);
  }
}
</script>

<template>
  <div class="page channels-page">
    <div class="page-header">
      <h2>渠道接入</h2>
      <p class="page-sub">配置聊天平台，让 AI 助手接入你的消息渠道</p>
    </div>

    <div class="channels-list">
      <div
        v-for="ch in CHANNELS"
        :key="ch.key"
        :class="['channel-card', expanded[ch.key] && 'expanded', isConfigured(ch.key) && 'configured']"
      >
        <div class="channel-header" @click="toggle(ch.key)">
          <span class="ch-icon">{{ ch.icon }}</span>
          <div class="ch-info">
            <span class="ch-label">{{ ch.label }}</span>
            <span class="ch-desc">{{ ch.desc }}</span>
          </div>
          <span v-if="isConfigured(ch.key)" class="ch-badge">已配置</span>
          <span class="ch-arrow">{{ expanded[ch.key] ? '▲' : '▼' }}</span>
        </div>

        <div v-if="expanded[ch.key]" class="channel-form">
          <div v-for="f in ch.fields" :key="f.id" class="form-group">
            <label>{{ f.label }}</label>
            <input
              v-model="formValues[ch.key][f.id]"
              type="text"
              :placeholder="f.placeholder"
              class="form-input"
            />
            <p v-if="f.hint" class="form-hint">
              {{ f.hint }}：
              <button class="hint-link" @click="onOpenUrl(f.hintUrl!)">{{ f.hintLabel }}</button>
            </p>
          </div>
          <div class="docs-row">
            <button class="docs-btn" @click="onOpenUrl(ch.docsUrl)">📖 查看接入文档</button>
          </div>
        </div>
      </div>
    </div>

    <div class="tip-card">
      <p>💻 其他渠道（QQ Bot、Telegram、飞书、Slack 等）可在<strong>终端</strong>页面通过 <code>openclaw channels setup</code> 命令添加。</p>
    </div>

    <!-- 微信专属卡片（插件已默认安装，只需扫码登录） -->
    <div class="weixin-card">
      <div class="weixin-header">
        <span class="ch-icon">💚</span>
        <div class="ch-info">
          <span class="ch-label">微信（官方插件）</span>
          <span class="ch-desc">插件已默认安装，扫码登录即可接入微信，无需 AppID/Secret</span>
        </div>
        <button class="docs-btn" @click="onOpenUrl('https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin')">📖 文档</button>
      </div>
      <div class="weixin-steps">
        <div class="weixin-step">
          <span class="step-num">1</span>
          <div class="step-body">
            <div class="step-title">扫码登录</div>
            <div class="step-desc">切换到「终端」页面，执行登录命令，用手机扫码授权</div>
            <button class="btn btn-outline-sm" @click="goToWeixinLogin">
              📱 微信扫码登录
            </button>
          </div>
        </div>
        <div class="weixin-step">
          <span class="step-num">2</span>
          <div class="step-body">
            <div class="step-title">重启 OpenClaw</div>
            <div class="step-desc">登录成功后重启服务，微信渠道即可上线</div>
          </div>
        </div>
      </div>
      <div v-if="weixinMsg" class="weixin-msg">{{ weixinMsg }}</div>
    </div>
  </div>
</template>

<style scoped>
.channels-page { display: flex; flex-direction: column; gap: 0; }

.page-header { margin-bottom: 20px; }
.page-header h2 { font-size: 1.1rem; font-weight: 700; color: var(--text); margin-bottom: 2px; }
.page-sub { font-size: 0.8rem; color: var(--text2); }

.channels-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }

.channel-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg2);
  overflow: hidden;
  transition: border-color 0.15s;
}
.channel-card.configured { border-color: var(--success); }
.channel-card.expanded { border-color: var(--accent); }

.channel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  cursor: pointer;
  user-select: none;
}
.channel-header:hover { background: var(--bg3); }

.ch-icon { font-size: 1.3rem; flex-shrink: 0; }
.ch-info { flex: 1; min-width: 0; }
.ch-label { display: block; font-weight: 600; font-size: 0.9rem; color: var(--text); }
.ch-desc { display: block; font-size: 0.75rem; color: var(--text2); margin-top: 1px; }
.ch-badge { font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; background: color-mix(in srgb, var(--success) 15%, transparent); color: var(--success); flex-shrink: 0; }
.ch-arrow { font-size: 0.7rem; color: var(--text3); flex-shrink: 0; }

.channel-form {
  padding: 0 16px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 14px;
}

.form-group { display: flex; flex-direction: column; gap: 5px; }
.form-group label { font-size: 0.8rem; color: var(--text2); font-weight: 500; }
.form-input {
  padding: 9px 12px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text);
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.15s;
}
.form-input:focus { border-color: var(--accent); }
.form-hint { font-size: 0.75rem; color: var(--text2); }
.hint-link { background: none; border: none; color: var(--accent); cursor: pointer; font-size: inherit; padding: 0; text-decoration: underline; }
.hint-link:hover { color: var(--accent-hover); }

.docs-row { display: flex; justify-content: flex-end; }
.docs-btn { background: none; border: 1px solid var(--border); border-radius: 6px; padding: 5px 12px; color: var(--text2); font-size: 0.78rem; cursor: pointer; transition: all 0.15s; }
.docs-btn:hover { background: var(--bg3); color: var(--text); border-color: var(--accent); }

.save-row { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.save-msg { font-size: 0.82rem; color: var(--text2); }

.btn { padding: 9px 20px; border-radius: 8px; font-size: 0.85rem; font-weight: 500; cursor: pointer; border: 1px solid transparent; display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s; }
.btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
.spinner { width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }

.tip-card { background: color-mix(in srgb, var(--info) 8%, transparent); border: 1px solid color-mix(in srgb, var(--info) 25%, transparent); border-radius: 8px; padding: 12px 16px; font-size: 0.8rem; color: var(--text2); line-height: 1.6; margin-bottom: 16px; }
.tip-card strong { color: var(--text); }
.tip-card code { background: var(--bg3); padding: 1px 5px; border-radius: 4px; font-size: 0.85em; color: var(--accent); font-family: "Cascadia Code", "Fira Code", Consolas, monospace; }

/* 微信卡片 */
.weixin-card {
  border: 1px solid color-mix(in srgb, #10b981 40%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, #10b981 5%, var(--bg2));
  padding: 16px;
  margin-top: 4px;
}
.weixin-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.weixin-steps { display: flex; flex-direction: column; gap: 12px; }
.weixin-step { display: flex; align-items: flex-start; gap: 12px; }
.step-num {
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--accent); color: #fff;
  font-size: 0.75rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; margin-top: 2px;
}
.step-body { flex: 1; }
.step-title { font-size: 0.88rem; font-weight: 600; color: var(--text); margin-bottom: 2px; }
.step-desc { font-size: 0.78rem; color: var(--text2); margin-bottom: 8px; }
.step-desc code { background: var(--bg3); padding: 1px 5px; border-radius: 4px; font-size: 0.85em; color: var(--accent); }
.btn-outline-sm {
  padding: 5px 12px; border-radius: 6px; font-size: 0.78rem; font-weight: 500;
  cursor: pointer; border: 1px solid var(--accent); color: var(--accent);
  background: transparent; display: inline-flex; align-items: center; gap: 5px;
  transition: all 0.15s;
}
.btn-outline-sm:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.btn-outline-sm:disabled { opacity: 0.45; cursor: not-allowed; }
.spinner-sm { width: 10px; height: 10px; border: 2px solid color-mix(in srgb, var(--accent) 30%, transparent); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
.weixin-msg { margin-top: 12px; font-size: 0.82rem; color: var(--text2); padding: 8px 12px; background: var(--bg3); border-radius: 6px; }
</style>
