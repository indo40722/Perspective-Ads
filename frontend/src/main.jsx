import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { registerOfflineSupport } from "./offlineCampaign.js";
import "../css/style.css";

registerOfflineSupport().catch(() => {});

createRoot(document.getElementById("root")).render(<App />);
