import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "whoami",
  title: "Who am I",
  description: "Return the signed-in user's id and email as authenticated by the MCP OAuth token.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (_input, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const user = { id: ctx.getUserId(), email: ctx.getUserEmail() };
    return {
      content: [{ type: "text", text: JSON.stringify(user) }],
      structuredContent: { user },
    };
  },
});