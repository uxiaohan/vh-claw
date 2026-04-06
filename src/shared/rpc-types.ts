import type { ElectrobunRPCSchema } from "electrobun/view";

// ─── 共享类型 ─────────────────────────────────────────────────────────────────

export type AppStatus = "uninitialized" | "stopped" | "starting" | "running";

export type EnvStatus = {
  bunExists: boolean;
  openclawInstalled: boolean;
};

// ─── OpenClaw 配置类型 ────────────────────────────────────────────────────────

export interface OpenClawConfig {
  gateway?: {
    mode?: string;
    auth?: {
      mode?: string;
      token?: string;
      scopes?: string[];
    };
  };
  models?: {
    mode?: string;
    providers?: Record<string, {
      baseUrl?: string;
      apiKey?: string;
      api?: string;
      models?: Array<{
        id: string;
        name: string;
        reasoning?: boolean;
        input?: string[];
        cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
        contextWindow?: number;
        maxTokens?: number;
      }>;
    }>;
  };
  agents?: {
    defaults?: {
      model?: { primary?: string };
      maxConcurrent?: number;
    };
  };
  env?: Record<string, string>;
  channels?: Record<string, unknown>;
  commands?: Record<string, unknown>;
  meta?: {
    lastTouchedVersion?: string;
    lastTouchedAt?: string;
  };
}

/** 模型 provider 配置（用于配置向导） */
export interface ModelProvider {
  /** provider 标识，如 deepseek / minimax / zai 等 */
  name: string;
  /** 特殊类型：zai = 智谱内置 provider */
  type?: "zai" | "openai-compatible";
  baseUrl: string;
  model: string;
  apiKey: string;
}

/** 已配置的模型条目（用于配置列表展示） */
export interface ConfiguredModel {
  /** provider 标识 */
  name: string;
  /** 显示标签，如 DeepSeek */
  label: string;
  /** emoji 图标 */
  emoji: string;
  /** 模型 ID */
  model: string;
  /** API 地址 */
  baseUrl: string;
  /** 是否为当前激活模型 */
  active: boolean;
  /** 特殊类型 */
  type?: "zai" | "openai-compatible";
}

/**
 * OpenClaw Portable RPC 契约
 */
export interface OpenClawRPCSchema extends ElectrobunRPCSchema {
  bun: {
    requests: {
      /** 获取当前 AppStatus */
      getStatus: {
        params: undefined;
        response: AppStatus;
      };
      /** 获取环境检测结果 */
      getEnvStatus: {
        params: undefined;
        response: EnvStatus;
      };
      /** 触发完整初始化流程（下载 bun + 安装 openclaw） */
      initialize: {
        params: undefined;
        response: void;
      };
      /** 启动 OpenClaw 进程 */
      start: {
        params: undefined;
        response: void;
      };
      /** 停止 OpenClaw 进程 */
      stop: {
        params: undefined;
        response: void;
      };
      /** 用系统默认浏览器打开 OpenClaw Web UI（带 token） */
      openWebUI: {
        params: undefined;
        response: void;
      };
      /** 用系统浏览器打开指定 URL */
      openUrl: {
        params: { url: string };
        response: void;
      };
      /** 执行 openclaw 命令，返回输出 */
      runCommand: {
        params: { args: string[] };
        response: { stdout: string; stderr: string; exitCode: number };
      };
      /** 获取 Gateway Token */
      getToken: {
        params: undefined;
        response: string;
      };
      /** 获取 U 盘剩余空间 */
      getDiskFree: {
        params: undefined;
        response: string;
      };
      /** 读取当前 openclaw.json 配置 */
      getConfig: {
        params: undefined;
        response: OpenClawConfig;
      };
      /** 配置模型 provider */
      configureModel: {
        params: ModelProvider;
        response: void;
      };
      /** 获取已配置的模型列表 */
      getConfiguredModels: {
        params: undefined;
        response: ConfiguredModel[];
      };
      /** 删除指定 provider 的配置 */
      deleteModel: {
        params: { name: string };
        response: void;
      };
      /** 设置激活模型 */
      setActiveModel: {
        params: { name: string; model: string };
        response: void;
      };
      /** 启动 PTY 交互进程 */
      ptyStart: {
        params: { args: string[]; cols: number; rows: number };
        response: { sessionId: string };
      };
      /** 向 PTY 进程发送输入 */
      ptyInput: {
        params: { sessionId: string; data: string };
        response: void;
      };
      /** 调整 PTY 窗口大小 */
      ptyResize: {
        params: { sessionId: string; cols: number; rows: number };
        response: void;
      };
      /** 停止 PTY 进程 */
      ptyStop: {
        params: { sessionId: string };
        response: void;
      };
    };
    messages: Record<never, never>;
  };
  webview: {
    requests: Record<never, never>;
    messages: {
      /** 状态变更推送 */
      statusUpdate: { status: AppStatus };
      /** 实时日志行 */
      logLine: { text: string; level: "info" | "error" };
      /** 初始化进度 */
      progress: { message: string; percent: number };
      /** PTY 输出数据 */
      ptyData: { sessionId: string; data: string };
      /** PTY 进程退出 */
      ptyExit: { sessionId: string; exitCode: number };
    };
  };
}
