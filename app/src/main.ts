import { createClient } from "./lib/api";

// Placeholder entry (Task 10 replaces this with the Svelte app); referencing the client makes Vite emit the worker chunk.
(window as unknown as { nhseApi: unknown }).nhseApi = createClient();
document.getElementById("app")!.textContent = "NHSE Web";
