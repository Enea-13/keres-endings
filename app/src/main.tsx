import "@fontsource-variable/source-serif-4";
import "@fontsource-variable/source-serif-4/wght-italic.css";
import "@fontsource/eb-garamond/500.css";
import "@fontsource/eb-garamond/600.css";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.cburnett.css";
import "./styles.css";

import { lazy, StrictMode, Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ReaderPage } from "./reader/ReaderPage";
import { applyTheme, usePrefs } from "./store/prefs";
import { HomePage } from "./ui/HomePage";

const QaPage = lazy(() => import("./qa/QaPage").then((m) => ({ default: m.QaPage })));

const router = createBrowserRouter([
  { path: "/", element: <HomePage /> },
  { path: "/read/:sectionId", element: <ReaderPage /> },
  {
    path: "/qa",
    element: (
      <Suspense fallback={null}>
        <QaPage />
      </Suspense>
    ),
  },
  { path: "*", element: <HomePage /> },
]);

function App() {
  const theme = usePrefs((s) => s.theme);
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);
  return <RouterProvider router={router} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
