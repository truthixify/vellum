import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@vellum/ui";
import "@vellum/ui/styles.css";
import "./styles.css";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root was not found");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
