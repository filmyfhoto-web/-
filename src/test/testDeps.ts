/**
 * Single entry point that E2E tests import from the running dev server so
 * they share the *same* React / react-router / react-query instances the app
 * uses. Importing bare specifiers (or the pre-bundled dep URLs) inside
 * page.evaluate() creates duplicate module instances and breaks context.
 */
import * as ReactNS from "react";
// interop: the pre-bundled CJS namespace puts the API under `default`.
export const React: any = (ReactNS as any).default ?? ReactNS;
export { createRoot } from "react-dom/client";
export { MemoryRouter, Routes, Route } from "react-router-dom";
export { QueryClient, QueryClientProvider } from "@tanstack/react-query";
export { AuthProvider } from "@/contexts/AuthContext";
