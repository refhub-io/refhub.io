import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const storedTheme = localStorage.getItem("theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.classList.toggle("dark", storedTheme ? storedTheme === "dark" : prefersDark);

createRoot(document.getElementById("root")!).render(<App />);
