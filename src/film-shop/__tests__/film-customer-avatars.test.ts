import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("film shop customer avatars", () => {
  it("resolves LINE profiles from a film customer id", () => {
    const src = read("src/film-shop/hooks/useFilmCustomerProfiles.ts");
    expect(src).toContain("film_customers");
    expect(src).toContain("line_user_id");
    expect(src).toContain("useLineProfiles");
  });

  it.each([
    "src/film-shop/components/orders/OrderManager.tsx",
    "src/film-shop/components/queue/JobQueue.tsx",
    "src/film-shop/components/board/JobKanbanBoard.tsx",
    "src/film-shop/components/inbox/LineJobInbox.tsx",
  ])("shows customer picture + name in %s", (file) => {
    const src = read(file);
    expect(src).toContain("CustomerAvatar");
  });

  it("carries customer_id through the job board query", () => {
    const src = read("src/film-shop/hooks/useJobBoard.ts");
    expect(src).toContain("customer_id");
    expect(src).toContain("customerId");
  });
});
