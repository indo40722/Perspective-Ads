import { createRoot } from "react-dom/client";
import AdminApp from "./admin/AdminApp.jsx";
import { registerOfflineSupport } from "./offlineCampaign.js";

registerOfflineSupport().catch(() => {});

createRoot(document.getElementById("root")).render(<AdminApp />);
