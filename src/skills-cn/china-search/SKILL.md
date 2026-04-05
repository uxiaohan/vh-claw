---
name: china-search
description: "国内搜索引擎 - 百度、搜狗、Bing中国搜索，绕过GFW限制"
metadata: { "openclaw": { "emoji": "🔍" } }
---

# 国内搜索引擎助手

在无法访问 Google 的环境下，通过 curl 调用百度、搜狗、Bing 中国等国内搜索引擎获取信息。

## 功能概述

- **百度搜索**: 中文信息最全的搜索引擎
- **搜狗搜索**: 微信公众号文章搜索利器
- **Bing 中国**: 国际信息 + 国内可访问
- **搜索优化**: 帮你构造更精准的搜索关键词
- **结果整理**: 将搜索结果整理为结构化信息

## 搜索命令

### 百度搜索
```bash
curl -s -L "https://www.baidu.com/s?wd=关键词" \
  -H "User-Agent: Mozilla/5.0" | head -200
```

### 搜狗搜索（含微信文章）
```bash
# 网页搜索
curl -s -L "https://www.sogou.com/web?query=关键词" \
  -H "User-Agent: Mozilla/5.0"

# 微信文章搜索
curl -s -L "https://weixin.sogou.com/weixin?query=关键词" \
  -H "User-Agent: Mozilla/5.0"
```

### Bing 中国搜索
```bash
curl -s -L "https://cn.bing.com/search?q=关键词" \
  -H "User-Agent: Mozilla/5.0"
```

## 使用示例

### 搜索信息
```
帮我搜索"DeepSeek V3 发布时间和新特性"
```

### 搜微信文章
```
帮我在搜狗搜索最近关于"AI Agent"的微信公众号文章
```

### 对比搜索
```
分别用百度和Bing搜索"2024年中国GDP"，对比结果
```

### 精准搜索
```
帮我搜索 site:zhihu.com "大模型部署"相关的知乎回答
```

## 搜索技巧

| 语法 | 说明 | 示例 |
|-----|------|------|
| "" | 精确匹配 | "人工智能" |
| site: | 限定网站 | site:zhihu.com AI |
| filetype: | 限定文件类型 | filetype:pdf 机器学习 |
| - | 排除关键词 | 苹果 -手机 |
| intitle: | 标题含关键词 | intitle:教程 Python |

## 适用场景

- 需要搜索中文互联网信息
- Google 不可用时的替代方案
- 专门搜索微信公众号文章
- 需要搜索国内网站的特定内容
- 查找百度百科、知乎等平台信息

## 不适用场景

- 需要搜索英文/国际信息（建议使用 WebSearch 工具）
- 需要实时热搜排行（搜索结果有延迟）
- 需要搜索被百度屏蔽的敏感内容
- 需要大量爬取搜索结果（有反爬限制）

## 注意事项

- curl 获取的是 HTML 原始内容，需要解析提取有用信息
- 百度搜索有反爬机制，频繁请求可能被拦截
- 搜狗微信搜索是查找公众号文章的最佳渠道
- Bing 中国版内容审核较百度宽松
- 建议添加 User-Agent 头部模拟浏览器访问
- 部分搜索结果链接需要二次跳转才能获取真实 URL
