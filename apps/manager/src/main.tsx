import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "./styles.css";

// dev-only design-exploration switch: /?theme=instrument | glass
{
  const theme = new URLSearchParams(window.location.search).get("theme");
  if (theme === "instrument" || theme === "glass") {
    document.documentElement.dataset.theme = theme;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
