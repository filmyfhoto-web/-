import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { recordNavigation } from "@/lib/navDiagnostics";

/**
 * Records every route change and flags redirect loops. Renders nothing —
 * mounted once inside the router so it sees all navigations.
 */
export default function NavLoopWatcher() {
  const location = useLocation();
  useEffect(() => {
    recordNavigation(location.pathname);
  }, [location.pathname, location.search]);
  return null;
}