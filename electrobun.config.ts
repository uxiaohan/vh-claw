import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "VH-Claw",
		identifier: "com.vvhan.vh-claw",
		version: "1.0.0",
	},
	build: {
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
		},
		// appIcon 属性在当前 ElectrobunConfig 类型中不存在，已注释掉
		// appIcon: "resources/icons/icon.png",
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
			icons: "resources/icons/icon.icns",
		},
		win: {
			bundleCEF: false,
			icon: "resources/icons/icon.ico",
		},
	},
} satisfies ElectrobunConfig;
