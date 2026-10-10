// Fresh data for every end-to-end run (kept outside the project; see playwright.config.ts).
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

rmSync(path.join(os.tmpdir(), "chiron-e2e-data"), { recursive: true, force: true });
