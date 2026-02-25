import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

function renderFatal(message: string) {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <div style="padding:20px;font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif">
      <h2 style="margin:0 0 8px;color:#b91c1c">Ç°¶ËÆô¶¯Ê§°Ü</h2>
      <pre style="white-space:pre-wrap;background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:12px;color:#9f1239">${message}</pre>
    </div>
  `;
}

window.addEventListener("error", (event) => {
  const msg = event.error?.stack || event.message || "unknown_error";
  renderFatal(`window.error: ${msg}`);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = (event.reason && (event.reason.stack || event.reason.message)) || String(event.reason || "unknown_rejection");
  renderFatal(`unhandledrejection: ${reason}`);
});

try {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (error) {
  const msg = error instanceof Error ? error.stack || error.message : String(error);
  renderFatal(`bootstrap_error: ${msg}`);
}
