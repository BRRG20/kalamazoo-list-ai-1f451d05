import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Guard: Log error if Supabase env vars are missing (no values printed)
if (!import.meta.env.VITE_SUPABASE_URL) {
  console.error("Missing env: VITE_SUPABASE_URL");
}
if (!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  console.error("Missing env: VITE_SUPABASE_PUBLISHABLE_KEY");
}

createRoot(document.getElementById("root")!).render(<App />);
