import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { store } from "./store/store";
import App from "./App";
import { ThemeProvider } from "./context/ThemeContext";
import { SchedulePaletteProvider } from "./context/SchedulePaletteContext";
import "./style.css";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <ThemeProvider>
          <SchedulePaletteProvider>
            <App />
            <Toaster position="bottom-right" />
          </SchedulePaletteProvider>
        </ThemeProvider>
      </BrowserRouter>
    </Provider>
  </StrictMode>
);
