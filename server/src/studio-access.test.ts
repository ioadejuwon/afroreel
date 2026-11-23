import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { adminRouter } from "./routes/admin";
import type { AdminRole } from "./types";

function studio(role: AdminRole) {
  const app = express();
  app.use((req, _res, next) => {
    req.admin = {id: 1, name: "Member", email:"role@example.test", role, session_version:1};
    next();
  });
  app.use("/admin",adminRouter);
  return app;
}

describe("studio role gates", () => {
  it.each(["admin","editor","analyst"] as const)("protects team mutations from %s", async role => {
    const app = studio(role);
    for (const route of ["/team/member/2/reset","/team/invite","/team/member/1/access","/team/member/1/remove","/team/invite/2/resend"]) {
      await request(app).post("/admin"+route).expect(403);
    }
    await request(app).get("/admin/team").expect(403);
  });

  it.each(["analyst","editor"] as const)("protects private studio operations from %s", async role => {
    const app = studio(role);
    for (const route of ["/users","/users/1","/monetization","/monetization/wallet/1","/settings"]) {
      await request(app).get("/admin"+route).expect(403);
    }
    await request(app).post("/admin/users/1/access").expect(403);
    await request(app).post("/admin/settings").expect(403);
  });

  it("enforces read-only content access on form and direct-upload endpoints", async () => {
    const app = studio("analyst");
    for (const route of ["/series/new","/series/1/edit","/series/1/episodes/new"]) {
      await request(app).get("/admin"+route).expect(403);
    }
    for (const route of ["/series","/series/1/edit","/episodes","/episodes/1/delete","/series/1/status",
      "/api/cloudflare/image-upload-url","/api/episodes/1/tus-upload-url","/api/episodes/1/refresh-video"]) {
      await request(app).post("/admin"+route).expect(403);
    }
  });
});
