import { createRoot } from "react-dom/client";
import AdminCloudRoot from "./admin/AdminCloudRoot.jsx";
import { registerOfflineSupport } from "./offlineCampaign.js";

registerOfflineSupport().catch(() => {});

createRoot(document.getElementById("root")).render(<AdminCloudRoot />);
