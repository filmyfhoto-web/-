import Login from "./Login";

/**
 * Staff login entry point. Renders the admin login form directly at
 * /admin-login on any host, so users don't need to know about `?admin=1`.
 */
export default function AdminLoginRedirect() {
  return <Login />;
}