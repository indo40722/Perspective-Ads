import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    worker: {
        format: "iife",
    },
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    base: "./",
    build: {
        outDir: "dist",
        emptyOutDir: true,
        manifest: "manifest.json",
        rollupOptions: {
            input: ["index.html", "admin.html", "coupon.html", "redeem.html"],
        },
    },
    server: {
        proxy: {
            "/api": "http://127.0.0.1:8000",
        },
    },
});
