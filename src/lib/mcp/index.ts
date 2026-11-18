import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import searchProductsTool from "./tools/search-products";
import listMyOrdersTool from "./tools/list-my-orders";

// The OAuth issuer must be the direct Supabase host (not the .lovable.cloud proxy).
// Read the project ref from Vite's inlined env so this stays import-safe.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "nattaporn-mcp",
  title: "ร้านนัฐภรณ์ เชียงกลาง — MCP",
  version: "0.1.0",
  instructions:
    "Tools for the ร้านนัฐภรณ์ shop app. Use `whoami` to verify connectivity, `search_products` to look up items in the catalog, and `list_my_orders` to read the caller's orders. All calls run as the signed-in user with row-level security enforced.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, searchProductsTool, listMyOrdersTool],
});