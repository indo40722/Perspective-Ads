import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    base: "./",
    build: {
        outDir: "dist",
        emptyOutDir: true,
        rollupOptions: {
        input: ["index.html", "coupon.html", "redeem.html"],
        },
    },
    server: {
        proxy: {
            "/api": "http://127.0.0.1:8000",
        },
    },
});
