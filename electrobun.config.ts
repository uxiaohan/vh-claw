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
		appIcon: "resources/icons/icon.png",
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
			icon: "resources/icons/icon.icns",
		},
		linux: {
			bundleCEF: false,
			icon: "resources/icons/icon.png",
		},
		win: {
			bundleCEF: false,
			icon: "resources/icons/icon.ico",
		},
	},
} satisfies ElectrobunConfig;
