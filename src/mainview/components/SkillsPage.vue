<script setup lang="ts">
const SKILLS_CN = [
  { name: "bilibili-helper",    label: "B站助手",      emoji: "📺", desc: "视频标题、描述、标签、封面优化" },
  { name: "china-search",       label: "国内搜索",      emoji: "🔍", desc: "百度、搜狗、Bing中国搜索" },
  { name: "china-translate",    label: "中文翻译",      emoji: "🌐", desc: "中英互译，支持多种语言" },
  { name: "china-weather",      label: "天气查询",      emoji: "🌤️", desc: "国内城市天气实时查询" },
  { name: "deepseek-helper",    label: "DeepSeek助手",  emoji: "🔵", desc: "DeepSeek模型使用技巧" },
  { name: "douyin-script",      label: "抖音脚本",      emoji: "🎵", desc: "短视频脚本、文案创作" },
  { name: "wechat-article",     label: "公众号文章",    emoji: "💬", desc: "微信公众号排版与写作" },
  { name: "weibo-poster",       label: "微博发帖",      emoji: "🐦", desc: "微博内容创作与话题策略" },
  { name: "xiaohongshu-writer", label: "小红书写作",    emoji: "📕", desc: "爆款笔记标题与内容创作" },
  { name: "zhihu-writer",       label: "知乎写作",      emoji: "📝", desc: "高赞回答与专栏文章写作" },
];
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2>技能中心</h2>
      <p class="page-sub">{{ SKILLS_CN.length }} 个额外的中文优化技能，随 OpenClaw 内置技能自动加载</p>
    </div>

    <div class="skills-grid">
      <div v-for="s in SKILLS_CN" :key="s.name" class="skill-card">
        <div class="skill-emoji">{{ s.emoji }}</div>
        <div class="skill-body">
          <div class="skill-name">{{ s.label }}</div>
          <div class="skill-desc">{{ s.desc }}</div>
        </div>
        <div class="skill-badge">已安装</div>
      </div>
    </div>

    <div class="skills-note">
      <span>💡</span>
      <span>技能在初始化时自动部署到 OpenClaw，启动后可在 Web 界面中直接使用。</span>
    </div>
  </div>
</template>
