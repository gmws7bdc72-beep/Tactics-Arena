import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="top-center"
      theme="dark"
      toastOptions={{
        duration: 2200,
        style: {
          background: "#111827",
          border: "1px solid rgba(56,189,248,.32)",
          color: "#f8fafc",
        },
      }}
    />
  </React.StrictMode>,
);
