import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
	plugins: [vue()],
	root: "src/mainview",
	build: {
		outDir: "../../dist",
		emptyOutDir: true,
		rollupOptions: {
			output: {
				manualChunks: {
					vue: ["vue"],
				},
			},
		},
	},
	server: {
		port: 5173,
		strictPort: true,
	},
});
