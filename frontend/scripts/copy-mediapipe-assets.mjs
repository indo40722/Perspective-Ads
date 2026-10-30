import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const frontendRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceDirectory = path.join(frontendRoot, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const destinationDirectory = path.join(frontendRoot, "dist", "assets", "mediapipe", "wasm");
const runtimeFiles = [
    "vision_wasm_internal.js",
    "vision_wasm_internal.wasm",
    "vision_wasm_nosimd_internal.js",
    "vision_wasm_nosimd_internal.wasm",
];

await mkdir(destinationDirectory, { recursive: true });
await Promise.all(runtimeFiles.map((file) => cp(
    path.join(sourceDirectory, file),
    path.join(destinationDirectory, file),
)));
