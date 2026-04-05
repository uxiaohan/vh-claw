<script setup lang="ts">
import { ref } from "vue";
import type { ModelProvider, ConfiguredModel } from "../../shared/rpc-types";

const props = defineProps<{
  configuredModels: ConfiguredModel[];
}>();

const emit = defineEmits<{
  save: [provider: ModelProvider];
  openUrl: [url: string];
  deleteModel: [name: string];
  setActiveModel: [name: string, model: string];
}>();

const MODEL_PRESETS = [
  { name: "deepseek",    label: "DeepSeek",     emoji: "🔵", tags: ["国内", "便宜"],  baseUrl: "https://api.deepseek.com/v1",                       model: "deepseek-chat",             keyUrl: "https://platform.deepseek.com/" },
  { name: "minimax",     label: "MiniMax",      emoji: "🟠", tags: ["国内", "推荐"],  baseUrl: "https://api.minimax.chat/v1",                       model: "MiniMax-Text-01",           keyUrl: "https://platform.minimaxi.com/" },
  { name: "kimi",        label: "Kimi",         emoji: "🌙", tags: ["国内", "快"],    baseUrl: "https://api.moonshot.cn/v1",                        model: "moonshot-v1-auto",          keyUrl: "https://platform.moonshot.cn/" },
  { name: "qwen",        label: "通义千问",      emoji: "☁️", tags: ["国内", "免费"],  baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-turbo",                keyUrl: "https://dashscope.console.aliyun.com/" },
  { name: "doubao",      label: "豆包",          emoji: "🫘", tags: ["国内", "快"],    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",          model: "doubao-1.5-pro-32k",        keyUrl: "https://console.volcengine.com/ark" },
  { name: "siliconflow", label: "硅基流动",      emoji: "💎", tags: ["国内", "便宜"],  baseUrl: "https://api.siliconflow.cn/v1",                     model: "Qwen/Qwen2.5-72B-Instruct", keyUrl: "https://cloud.siliconflow.cn/" },
  { name: "zai",         label: "智谱 GLM",      emoji: "🧠", tags: ["国内", "免费"],  baseUrl: "",                                                  model: "glm-5",                     keyUrl: "https://open.bigmodel.cn/", type: "zai" as const },
  { name: "openai",      label: "OpenAI",        emoji: "⚡", tags: ["强"],            baseUrl: "https://api.openai.com/v1",                         model: "gpt-4o",                    keyUrl: "https://platform.openai.com/" },
  { name: "anthropic",   label: "Claude",        emoji: "🤖", tags: ["强"],            baseUrl: "https://api.anthropic.com/v1",                      model: "claude-sonnet-4-20250514",  keyUrl: "https://console.anthropic.com/" },
  { name: "groq",        label: "Groq",          emoji: "🚀", tags: ["极快", "免费"],  baseUrl: "https://api.groq.com/openai/v1",                    model: "llama-3.3-70b-versatile",   keyUrl: "https://console.groq.com/" },
  { name: "custom",      label: "自定义",         emoji: "🔧", tags: ["兼容"],          baseUrl: "",                                                  model: "",                          keyUrl: "" },
];

// view: "list" = 配置列表主页, "select" = 选择模型, "form" = 填写 key
type View = "list" | "select" | "form";
const view = ref<View>("list");
const selected = ref<typeof MODEL_PRESETS[0] | null>(null);
const editingModel = ref<ConfiguredModel | null>(null);
const apiKey = ref("");
const customBase = ref("");
const customModel = ref("");
const showKey = ref(false);
const saving = ref(false);
const saveMsg = ref("");
const deleteConfirm = ref<string | null>(null);

function openAdd() {
  editingModel.value = null;
  selected.value = null;
  apiKey.value = "";
  customBase.value = "";
  customModel.value = "";
  saveMsg.value = "";
  view.value = "select";
}

function openEdit(m: ConfiguredModel) {
  editingModel.value = m;
  const preset = MODEL_PRESETS.find(p => p.name === m.name) ?? MODEL_PRESETS[MODEL_PRESETS.length - 1];
  selected.value = preset;
  apiKey.value = "";
  customBase.value = m.baseUrl;
  customModel.value = m.model;
  saveMsg.value = "";
  view.value = "form";
}

function selectPreset(p: typeof MODEL_PRESETS[0]) {
  selected.value = p;
  apiKey.value = "";
  customBase.value = p.baseUrl;
  customModel.value = p.model;
  saveMsg.value = "";
  view.value = "form";
}

function backToList() {
  view.value = "list";
  selected.value = null;
  editingModel.value = null;
  saveMsg.value = "";
}

function backToSelect() {
  view.value = "select";
  selected.value = null;
  saveMsg.value = "";
}

async function save() {
  if (!selected.value) return;
  const key = apiKey.value.trim();
  if (!key) { saveMsg.value = "请填写 API Key"; return; }
  const p = selected.value;
  const baseUrl = p.name === "custom" ? customBase.value.trim() : (customBase.value || p.baseUrl);
  const model = p.name === "custom" ? customModel.value.trim() : (customModel.value || p.model);
  if (p.name === "custom" && (!baseUrl || !model)) { saveMsg.value = "请填写 API 地址和模型名称"; return; }
  saving.value = true;
  saveMsg.value = "";
  try {
    emit("save", { name: p.name, type: p.type ?? "openai-compatible", baseUrl, model, apiKey: key } as ModelProvider);
    saveMsg.value = "✓ 配置已保存！";
    setTimeout(() => { backToList(); }, 1200);
  } catch (e) {
    saveMsg.value = "保存失败：" + (e instanceof Error ? e.message : String(e));
  } finally { saving.value = false; }
}

function confirmDelete(name: string) {
  deleteConfirm.value = name;
}

function cancelDelete() {
  deleteConfirm.value = null;
}

function doDelete(name: string) {
  emit("deleteModel", name);
  deleteConfirm.value = null;
}

function useModel(m: ConfiguredModel) {
  emit("setActiveModel", m.name, m.model);
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2>模型配置</h2>
      <p class="page-sub">管理和配置 AI 模型 API</p>
    </div>

    <!-- 配置列表主页 -->
    <div v-if="view === 'list'">
      <!-- 已配置模型列表 -->
      <div v-if="configuredModels.length > 0" class="section">
        <div class="section-title-row">
          <span class="section-title">已配置模型</span>
          <button class="btn btn-sm btn-primary" @click="openAdd">+ 添加模型</button>
        </div>
        <div class="configured-list">
          <div
            v-for="m in configuredModels"
            :key="m.name"
            :class="['configured-item', m.active && 'configured-item-active']"
          >
            <div class="ci-left">
              <span class="ci-emoji">{{ m.emoji }}</span>
              <div class="ci-info">
                <div class="ci-name">
                  {{ m.label }}
                  <span v-if="m.active" class="ci-badge-active">使用中</span>
                </div>
                <div class="ci-model">{{ m.model }}</div>
              </div>
            </div>
            <div class="ci-actions">
              <button
                v-if="!m.active"
                class="ci-btn ci-btn-use"
                title="设为当前模型"
                @click="useModel(m)"
              >使用</button>
              <button
                class="ci-btn ci-btn-edit"
                title="编辑配置"
                @click="openEdit(m)"
              >编辑</button>
              <button
                class="ci-btn ci-btn-del"
                title="删除"
                @click="confirmDelete(m.name)"
              >删除</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <div class="empty-icon">🤖</div>
        <div class="empty-text">还没有配置任何模型</div>
        <div class="empty-sub">选择一个 AI 服务商并填写 API Key 即可开始使用</div>
        <button class="btn btn-primary" @click="openAdd">+ 添加第一个模型</button>
      </div>

      <!-- 删除确认弹窗 -->
      <div v-if="deleteConfirm" class="modal-mask" @click.self="cancelDelete">
        <div class="modal-box">
          <div class="modal-title">确认删除</div>
          <div class="modal-body">确定要删除 <strong>{{ deleteConfirm }}</strong> 的配置吗？此操作不可撤销。</div>
          <div class="modal-actions">
            <button class="btn btn-ghost" @click="cancelDelete">取消</button>
            <button class="btn btn-danger" @click="doDelete(deleteConfirm!)">确认删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 选择模型 -->
    <div v-else-if="view === 'select'">
      <div class="back-row">
        <button class="back-btn" @click="backToList">← 返回配置列表</button>
      </div>
      <p class="section-hint">选择你要使用的 AI 模型（推荐国内用户选国内服务）</p>
      <div class="model-grid-full">
        <div
          v-for="p in MODEL_PRESETS"
          :key="p.name"
          class="model-card-full"
          @click="selectPreset(p)"
        >
          <div class="mc-emoji">{{ p.emoji }}</div>
          <div class="mc-body">
            <div class="mc-name">{{ p.label }}</div>
            <div class="mc-tags">
              <span v-for="t in p.tags" :key="t" class="mc-tag">{{ t }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 填写 Key 表单 -->
    <div v-else class="key-form">
      <div class="back-row">
        <button class="back-btn" @click="editingModel ? backToList() : backToSelect()">
          ← {{ editingModel ? '返回配置列表' : '返回选择模型' }}
        </button>
      </div>
      <div class="key-form-card">
        <div class="key-form-title">
          <span>{{ selected?.emoji }} {{ selected?.label }}</span>
          <button v-if="selected?.keyUrl" class="get-key-link-btn" @click="emit('openUrl', selected.keyUrl)">获取 API Key →</button>
        </div>

        <div v-if="selected?.name === 'custom'" class="field-group">
          <label>API 地址 (Base URL)</label>
          <input v-model="customBase" type="text" placeholder="https://api.example.com/v1" class="field-input" />
          <label>模型名称</label>
          <input v-model="customModel" type="text" placeholder="gpt-4o" class="field-input" />
        </div>
        <div v-else class="field-group">
          <label>API 地址</label>
          <input :value="customBase || selected?.baseUrl" type="text" class="field-input field-readonly" readonly />
          <label>模型</label>
          <input :value="customModel || selected?.model" type="text" class="field-input field-readonly" readonly />
        </div>

        <div class="field-group">
          <label>API Key {{ editingModel ? '（留空则保持原有 Key）' : '' }}</label>
          <div class="field-pw-wrap">
            <input v-model="apiKey" :type="showKey ? 'text' : 'password'" placeholder="sk-..." class="field-input" />
            <button class="pw-toggle" @click="showKey = !showKey">{{ showKey ? '🙈' : '👁' }}</button>
          </div>
        </div>

        <div v-if="saveMsg" :class="['save-banner', saveMsg.startsWith('✓') ? 'save-ok' : 'save-err']">
          {{ saveMsg }}
        </div>

        <button class="btn btn-primary btn-full" :disabled="saving" @click="save">
          <span v-if="saving" class="spinner" />
          {{ saving ? "保存中..." : (editingModel ? "💾 更新配置" : "💾 保存配置") }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── 配置列表 ── */
.section { margin-bottom: 20px; }
.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.section-title { font-size: 0.88rem; font-weight: 600; color: var(--text2); text-transform: uppercase; letter-spacing: 0.05em; }

.configured-list { display: flex; flex-direction: column; gap: 8px; }

.configured-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 10px;
  transition: border-color 0.15s;
}
.configured-item:hover { border-color: var(--accent); }
.configured-item-active { border-color: var(--success) !important; background: color-mix(in srgb, var(--success) 6%, var(--bg2)); }

.ci-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.ci-emoji { font-size: 1.4rem; flex-shrink: 0; }
.ci-info { min-width: 0; }
.ci-name { font-size: 0.9rem; font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 8px; }
.ci-badge-active {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--success) 15%, transparent);
  color: var(--success);
  border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
}
.ci-model { font-size: 0.75rem; color: var(--text2); margin-top: 2px; font-family: monospace; }

.ci-actions { display: flex; gap: 6px; flex-shrink: 0; }
.ci-btn {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--bg3);
  color: var(--text2);
  transition: all 0.15s;
}
.ci-btn:hover { color: var(--text); border-color: var(--accent); background: var(--bg2); }
.ci-btn-use { color: var(--success); border-color: color-mix(in srgb, var(--success) 40%, transparent); }
.ci-btn-use:hover { background: color-mix(in srgb, var(--success) 10%, transparent); border-color: var(--success); }
.ci-btn-del { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, transparent); }
.ci-btn-del:hover { background: color-mix(in srgb, var(--danger) 10%, transparent); border-color: var(--danger); }

/* ── 空状态 ── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 10px;
  text-align: center;
}
.empty-icon { font-size: 3rem; }
.empty-text { font-size: 1rem; font-weight: 600; color: var(--text); }
.empty-sub { font-size: 0.82rem; color: var(--text2); margin-bottom: 8px; }

/* ── 删除确认弹窗 ── */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal-box {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  width: 340px;
  max-width: 90vw;
}
.modal-title { font-size: 1rem; font-weight: 700; color: var(--text); margin-bottom: 10px; }
.modal-body { font-size: 0.88rem; color: var(--text2); margin-bottom: 20px; line-height: 1.6; }
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; }

/* ── 按钮 ── */
.btn { padding: 8px 16px; border-radius: 8px; font-size: 0.85rem; font-weight: 500; cursor: pointer; border: 1px solid transparent; transition: all 0.15s; display: inline-flex; align-items: center; gap: 6px; }
.btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-ghost { background: transparent; color: var(--text2); border-color: var(--border); }
.btn-ghost:hover { background: var(--bg3); color: var(--text); }
.btn-danger { background: var(--danger); color: #fff; border-color: var(--danger); }
.btn-danger:hover { opacity: 0.85; }
.btn-sm { padding: 5px 12px; font-size: 0.78rem; }
.btn-full { width: 100%; justify-content: center; }

/* ── 返回按钮 ── */
.back-row { margin-bottom: 14px; }
.back-btn { background: none; border: none; color: var(--text2); cursor: pointer; font-size: 0.85rem; padding: 0; }
.back-btn:hover { color: var(--accent); }

/* ── 模型选择网格 ── */
.section-hint { font-size: 0.82rem; color: var(--text2); margin-bottom: 14px; }
.model-grid-full { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
.model-card-full {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
}
.model-card-full:hover { border-color: var(--accent); background: var(--bg3); }
.mc-emoji { font-size: 1.3rem; flex-shrink: 0; }
.mc-body { min-width: 0; }
.mc-name { font-size: 0.88rem; font-weight: 600; color: var(--text); }
.mc-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.mc-tag { font-size: 0.68rem; padding: 1px 6px; border-radius: 4px; background: var(--bg3); color: var(--text2); border: 1px solid var(--border); }

/* ── Key 表单 ── */
.key-form-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
.key-form-title { display: flex; align-items: center; justify-content: space-between; font-size: 1rem; font-weight: 700; color: var(--text); margin-bottom: 18px; }
.get-key-link-btn { background: none; border: 1px solid var(--accent); color: var(--accent); border-radius: 6px; padding: 4px 10px; font-size: 0.78rem; cursor: pointer; }
.get-key-link-btn:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.field-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.field-group label { font-size: 0.8rem; color: var(--text2); font-weight: 500; }
.field-input { background: var(--bg3); border: 1px solid var(--border); border-radius: 7px; padding: 8px 12px; color: var(--text); font-size: 0.85rem; outline: none; transition: border-color 0.15s; width: 100%; box-sizing: border-box; }
.field-input:focus { border-color: var(--accent); }
.field-readonly { opacity: 0.6; cursor: default; }
.field-pw-wrap { position: relative; display: flex; }
.field-pw-wrap .field-input { padding-right: 40px; }
.pw-toggle { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 1rem; color: var(--text2); }
.save-banner { padding: 8px 12px; border-radius: 7px; font-size: 0.82rem; margin-bottom: 12px; }
.save-ok { background: color-mix(in srgb, var(--success) 12%, transparent); color: var(--success); border: 1px solid color-mix(in srgb, var(--success) 30%, transparent); }
.save-err { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent); }

.spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
