import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";
import "./silnik/prototype.css";
import "./silnik/mostek.css";
import "./silnik/comments.js";
import "./silnik/prototype.js";

import { App } from "./App";
import { SimProvider } from "./store";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SimProvider>
      <App />
    </SimProvider>
  </StrictMode>,
);
