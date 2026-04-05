import { BrowserWindow, BrowserView, Updater, Utils } from "electrobun/bun";
import type { OpenClawRPCSchema } from "../shared/rpc-types";
import * as RM from "./RuntimeManager";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.log(
        "Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
      );
    }
  }
  return "views://mainview/index.html";
}

const url = await getMainViewUrl();

// ─── 定义 RPC ────────────────────────────────────────────────────────────────

const rpc = BrowserView.defineRPC<OpenClawRPCSchema>({
  maxRequestTime: Infinity,
  handlers: {
    requests: {
      getStatus: () => RM.getStatus(),

      getEnvStatus: () => RM.checkEnvironment(),

      initialize: async () => {
        try {
          await RM.initialize((message, percent) => {
            push((r) => r.send.progress({ message, percent }));
          });
          push((r) => r.send.statusUpdate({ status: RM.getStatus() }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          push((r) =>
            r.send.logLine({ text: `初始化失败: ${msg}`, level: "error" }),
          );
          push((r) => r.send.statusUpdate({ status: RM.getStatus() }));
        }
      },

      start: async () => {
        try {
          await RM.startOpenClaw(
            (text, level) => {
              push((r) => r.send.logLine({ text, level }));
            },
            (status) => {
              push((r) => r.send.statusUpdate({ status }));
            },
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          push((r) =>
            r.send.logLine({ text: `启动失败: ${msg}`, level: "error" }),
          );
        }
      },

      stop: async () => {
        await RM.stopOpenClaw();
        push((r) => r.send.statusUpdate({ status: "stopped" }));
      },

      openWebUI: async () => {
        const urlWithToken = await RM.getWebUIUrlWithToken();
        Utils.openExternal(urlWithToken);
      },

      getToken: async () => {
        return await RM.getToken();
      },

      getConfig: async () => {
        return await RM.readConfig();
      },

      configureModel: async (provider) => {
        await RM.configureModel(provider);
      },

      getConfiguredModels: async () => {
        return await RM.getConfiguredModels();
      },

      deleteModel: async ({ name }) => {
        await RM.deleteModel(name);
      },

      setActiveModel: async ({ name, model }) => {
        await RM.setActiveModel(name, model);
      },

      openUrl: ({ url }) => {
        Utils.openExternal(url);
      },

      runCommand: async ({ args }) => {
        return await RM.runOpenClawCommand(args);
      },

      ptyStart: async ({ args, cols, rows }) => {
        // 先分配 sessionId，再启动，回调中直接用
        const sessionId = await RM.ptyStart(
          args, cols, rows,
          (sid, data) => push((r) => r.send.ptyData({ sessionId: sid, data })),
          (sid, exitCode) => push((r) => r.send.ptyExit({ sessionId: sid, exitCode })),
        );
        return { sessionId };
      },

      ptyInput: ({ sessionId, data }) => {
        RM.ptyInput(sessionId, data);
      },

      ptyResize: ({ sessionId, cols, rows }) => {
        RM.ptyResize(sessionId, cols, rows);
      },

      ptyStop: ({ sessionId }) => {
        RM.ptyStop(sessionId);
      },
    },
  },
});

// ─── 创建主窗口 ───────────────────────────────────────────────────────────────

const mainWindow = new BrowserWindow({
  title: "OpenClaw Portable",
  url,
  frame: {
    width: 1100,
    height: 720,
    x: 160,
    y: 100,
  },
  styleMask: { Resizable: true },
  rpc,
});

// ─── 推送辅助函数 ─────────────────────────────────────────────────────────────

type RpcInstance = NonNullable<typeof mainWindow.webview>["rpc"];

function push(fn: (r: NonNullable<RpcInstance>) => void): void {
  const r = mainWindow.webview?.rpc;
  if (r) fn(r);
}

// ─── 启动时自动检测环境，推送初始状态 ────────────────────────────────────────

// 延迟 500ms 确保前端 RPC WebSocket 已连接
setTimeout(async () => {
  await RM.checkEnvironment();
  push((r) => r.send.statusUpdate({ status: RM.getStatus() }));
}, 500);

console.log("OpenClaw Portable started!");
