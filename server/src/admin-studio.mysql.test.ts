// ADMIN_TEST_SOCKET enables this suite on a local MySQL server. Each run owns a disposable schema.
import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { config } from "./config";
import { pool } from "./db";
import { analyticsReport, listRecords, recordDetail, setAccountAccess, userDirectory, userProfile } from "./admin-reports";
import { seriesEpisodeAccess, episodeAccess, episodeDefaults, saveEpisodeDefaults } from "./admin-settings";
import { createMobileUser, findCurrentMobileUser, rotateMobileRefreshToken } from "./auth";
import { unlockEpisode } from "./content";
import { acceptInvitation, changeMember, emailsFrom, invitationForSetup, resendInvitation, sendInvitation } from "./admin-team";

import bcrypt from "bcryptjs";
import express from "express";
import session from "express-session";
import csrf from "csurf";
import request from "supertest";
import { adminRouter } from "./routes/admin";
import { attachCurrentAdmin, attemptAdminLogin } from "./auth";
import { requestReset, resetAvailable, redeemReset } from "./studio-password";

const fixture = vi.hoisted(() => ({ socket: process.env.ADMIN_TEST_SOCKET, schema: "afroreel_admin_test_" + Math.random().toString(16).slice(2) }));
vi.mock("./db", async () => {
  const { config } = await import("./config");
  const mysql = await import("mysql2/promise");
  return { pool: mysql.createPool({ ...config.db, socketPath: fixture.socket, database: fixture.schema }) };
});

describe.skipIf(!fixture.socket)("admin studio reports and operations", () => {
  let root: mysql.Connection;
  let created = false;
  beforeAll(async () => {
    root = await mysql.createConnection({ ...config.db, socketPath: fixture.socket });
    await root.query("CREATE DATABASE " + fixture.schema);
    created = true;
    for (const file of (await readdir("database/migrations")).filter(f => f.endsWith(".sql")).sort()) {
      for (const sql of (await readFile("database/migrations/" + file, "utf8")).split(/^-- migrate:split\s*$/m)) {
        if (sql.trim()) await pool.query(sql);
      }
    }
    await pool.query("CREATE TABLE schema_migrations (name VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP)");
    await pool.query("INSERT INTO schema_migrations VALUES ('005_daily_viewers.sql', FROM_UNIXTIME(?))", [Date.parse("2026-02-20") / 1000]);
    await pool.query("INSERT INTO series (series_id,title,slug,status) VALUES ('series1','Drama','drama','live')");
    await pool.query("INSERT INTO episodes (episode_id,series_id,episode_number,title,is_free,coin_cost,status) VALUES ('free',1,1,'Pilot',1,35,'live'),('paid',1,6,'Next',0,7,'live')");
    await pool.query("INSERT INTO mobile_users (user_id,name,email,username,password_hash,created_at) VALUES ('u1','Alex','one@example.test','alexone','unused',FROM_UNIXTIME(?)),('u2','Alex','two@example.test','alextwo','unused',FROM_UNIXTIME(?))", [Date.parse("2026-02-22") / 1000,Date.parse("2026-02-22") / 1000]);
  });
  afterAll(async () => {
    await pool.end();
    if (created) await root.query("DROP DATABASE " + fixture.schema);
    await root?.end();
  });

  it("keeps pending invites separate, rotates expiring links, and accepts once", async () => {
    const email = "studio-invite@example.test";
    const previousMode = config.nodeEnv, previousKey = config.resend.apiKey;
    config.nodeEnv = "development";
    config.resend.apiKey = "";
    try {
      const [actor] = await pool.execute<mysql.ResultSetHeader>("INSERT INTO admins (email,name,password_hash,role) VALUES (?,?,?,?)",["owner@example.test","Owner","unused","owner"]);
      const result = await sendInvitation(email, "editor", "Welcome", "/admin");
      const first = result.preview!.split("/").pop()!;
      expect((await invitationForSetup(first)).role).toBe("editor");
      expect(await invitationForSetup(first)).toBeTruthy();
      expect((await sendInvitation(email, "admin", "", "/admin")).preview).toBeUndefined();
      const id = (await invitationForSetup(first)).id;
      await pool.execute("UPDATE admin_invitations SET expires_at=NOW()-INTERVAL 1 SECOND WHERE id=?",[id]);
      expect(await invitationForSetup(first)).toBeUndefined();
      const second = (await resendInvitation(id, "/admin")).preview!.split("/").pop()!;
      expect(await invitationForSetup(first)).toBeUndefined();
      await changeMember(actor.insertId,"invite", id, "owner");
      const attempts = await Promise.allSettled([1,2].map(() => acceptInvitation(second, "Team member", "Private password 1234")));
      expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
      expect((await sendInvitation(email, "admin", "", "/admin")).text).toContain("active member");
      const [users] = await pool.query<mysql.RowDataPacket[]>("SELECT id,role FROM admins WHERE email=?",[email]);
      expect(users[0].role).toBe("owner");
      await changeMember(actor.insertId,"member",users[0].id,"analyst");
      await changeMember(actor.insertId,"member",users[0].id,null);
      const third = (await sendInvitation(email,"editor","","/admin")).preview!.split("/").pop()!;
      await changeMember(actor.insertId,"invite",(await invitationForSetup(third)).id,null);
      await expect(acceptInvitation(third,"Member","Private password 1234")).rejects.toThrow("unavailable");
    } finally { config.nodeEnv = previousMode; config.resend.apiKey = previousKey; }
  });

  it("reports mixed delivery outcomes per address without exposing tokens", async () => {
    const key = config.resend.apiKey, base = config.publicBaseUrl;
    vi.stubEnv("EMAIL_FROM", "team@example.test");
    config.resend.apiKey = "fixture";
    config.publicBaseUrl = "https://studio.example.test/catalog";
    const send = vi.fn().mockResolvedValueOnce(new Response("{}", {status:200})).mockResolvedValueOnce(new Response("{}", {status:422}));
    vi.stubGlobal("fetch",send);
    try {
      const emails = emailsFrom("one@test.example Two@test.example,ONE@test.example");
      expect(emails.length).toBe(2);
      const results = [];
      for (const email of emails) results.push(await sendInvitation(email,"admin","Hello <team>","/catalog/admin"));
      expect(results[0]).toMatchObject({text:"Invite sent"});
      expect(results[1].retryId).toBeTruthy();
      expect(results.every(r => !r.preview)).toBe(true);
      expect(send.mock.calls[0][1].body).toContain("https://studio.example.test/catalog/admin/setup/");
      expect(send.mock.calls[0][1].body).toContain("Hello &lt;team&gt;");
    } finally {
      vi.unstubAllGlobals(); vi.unstubAllEnvs(); config.resend.apiKey=key; config.publicBaseUrl=base;
    }
  });

  it("serializes co-owner demotions and protects self access and direct removal", async () => {
    const ids: number[] = [];
    for (const email of ["first-owner@example.test","second-owner@example.test"]) {
      const [row] = await pool.execute<mysql.ResultSetHeader>("INSERT INTO admins (email,name,password_hash,role) VALUES (?,'Owner','unused','owner')",[email]);
      ids.push(row.insertId);
    }
    const [first,second] = ids;
    await expect(changeMember(first,"member",first,"admin")).rejects.toThrow("own access");
    await expect(changeMember(first,"member",second,null)).rejects.toThrow("Demote");
    const attempts = await Promise.allSettled([changeMember(first,"member",second,"editor"),changeMember(second,"member",first,"admin")]);
    expect(attempts.filter(a => a.status === "fulfilled")).toHaveLength(1);
    const [owners] = await pool.query<mysql.RowDataPacket[]>("SELECT id FROM admins WHERE id IN (?,?) AND role='owner'",ids);
    expect(owners).toHaveLength(1);
    const other = owners[0].id === first ? second : first;
    await changeMember(owners[0].id,"member",other,"owner");
  });

  it("renders My account for every role and rotates passwords, links and sessions", async () => {
    const app = express();
    app.set("view engine","ejs").set("views","server/views");
    Object.assign(app.locals,{adminPath:"/admin",basePath:"",adminScriptVersion:"test"});
    app.use(express.urlencoded({extended:false}),session({secret:"disposable-session-tests",resave:false,saveUninitialized:false}),csrf(),attachCurrentAdmin);
    app.use("/admin",adminRouter);
    const old = "Original passphrase", fresh = "Changed passphrase", final = "Recovered passphrase";
    const hash = await bcrypt.hash(old,4);
    const csrfOf = (html: string) => html.match(/name="_csrf" value="([^"]+)"/)![1];
    const apiKey = config.resend.apiKey, base = config.publicBaseUrl;
    let token = "";
    vi.stubEnv("EMAIL_FROM","team@example.test");
    config.resend.apiKey = "fixture";
    config.publicBaseUrl = "https://studio.example.test/catalog";
    const send = vi.fn(async (_url: string,init: RequestInit) => {
      token = String(init.body).match(/reset-password\/([0-9a-f]{64})/)![1];
      return new Response("{}", {status:200});
    });
    vi.stubGlobal("fetch",send);
    try {
      for (const role of ["owner","admin","editor","analyst"]) {
        const email = role+"-account@example.test";
        const [member] = await pool.execute<mysql.ResultSetHeader>("INSERT INTO admins (email,name,password_hash,role) VALUES (?,'Member',?,?)",[email,hash,role]);
        const login = async () => {
          const agent = request.agent(app);
          const page = await agent.get("/admin/login").expect(200);
          expect(page.text).toContain("Forgot password?");
          await agent.post("/admin/login").type("form").send({email,password:old,_csrf:csrfOf(page.text)}).expect(302);
          return agent;
        };
        const client = await login();
        const page = await client.get("/admin/account").expect(200);
        expect(page.text).toContain("Change password");
        if (role !== "owner") continue;
        const team = await client.get("/admin/team/invite").expect(200);
        expect(team.text).toContain('value="owner"');
        const other = await login();
        const form = {password:fresh,confirmation:fresh,_csrf:csrfOf(page.text)};
        await client.post("/admin/account").type("form").send({...form,currentPassword:"incorrect"}).expect(400);
        expect(await requestReset(member.insertId,"/admin")).toBe(true);
        await client.post("/admin/account").type("form").send({...form,currentPassword:old}).expect(303);
        expect(await resetAvailable(token)).toBe(false);
        await client.get("/admin/account").expect(200);
        await other.get("/admin/account").expect(302);
        expect(await attemptAdminLogin(email,old)).toBeNull();
        expect(await requestReset(email,"/admin")).toBe(true);
        await pool.execute("UPDATE admins SET reset_expires_at=NOW()-INTERVAL 1 SECOND WHERE id=?",[member.insertId]);
        await client.get("/admin/reset-password/"+token).expect(410);
        send.mockResolvedValueOnce(new Response("{}", {status:422}));
        expect(await requestReset(email,"/admin")).toBe(false);
        expect(await resetAvailable(token)).toBe(false);
        expect(await requestReset(email,"/admin")).toBe(true);
        await client.get("/admin/reset-password/"+token).expect(200);
        expect(await attemptAdminLogin(email,fresh)).toBeTruthy();
        const results = await Promise.allSettled([redeemReset(token,final),redeemReset(token,final)]);
        expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
        expect(await resetAvailable(token)).toBe(false);
        await client.get("/admin/account").expect(302);
        expect(await attemptAdminLogin(email,final)).toBeTruthy();
      }
    } finally {
      vi.unstubAllGlobals(); vi.unstubAllEnvs(); config.resend.apiKey=apiKey; config.publicBaseUrl=base;
    }
  },20000);

  it("uses stable IDs for duplicate names and keeps an empty report usable", async () => {
    expect((await userDirectory({ search:"Alex" })).items.map(r => r.user_id)).toEqual(["u2","u1"]);
    expect((await userDirectory({ search:"two@example.test" })).total).toBe(1);
    expect((await userDirectory({ search:"alexone" })).total).toBe(1);
    expect((await userProfile("u1", {})).total).toBe(0);
    expect((await listRecords("purchases", {})).total).toBe(0);
    await expect(recordDetail("purchases","123")).rejects.toThrow("Record not found");
  });

  it("requires the correct name and revokes refresh tokens when suspending an account", async () => {
    const session = await createMobileUser({name:"Test user",email:"suspend@example.test",username:"suspendme",password:randomBytes(18).toString("hex")});
    const id = session.user.userId;
    await expect(setAccountAccess(id,"suspended","Wrong name")).rejects.toThrow("confirm suspension");
    await setAccountAccess(id,"suspended","Test user");
    expect(await findCurrentMobileUser(id)).toBeNull();
    expect(await rotateMobileRefreshToken(session.refreshToken)).toBeNull();
    expect((await userDirectory({status:"suspended"})).items.map(r => r.user_id)).toEqual([id]);
    await setAccountAccess(id,"active","");
    expect(await findCurrentMobileUser(id)).not.toBeNull();
    expect(await rotateMobileRefreshToken(session.refreshToken)).toBeNull();
  });

  it("reads saved episode defaults and allows explicit free and paid overrides", async () => {
    const defaults = await episodeDefaults();
    expect(episodeAccess(defaults,5,{})).toEqual({isFree:true,coinCost:0});
    expect(episodeAccess(defaults,6,{})).toEqual({isFree:false,coinCost:5});
    await saveEpisodeDefaults("2","12");
    expect(await seriesEpisodeAccess(1, 99, {})).toEqual({isFree:true,coinCost:0});
    await pool.query("UPDATE series SET default_episode_access='locked' WHERE id=1");
    expect(await seriesEpisodeAccess(1, 1, {})).toEqual({isFree:false,coinCost:12});
    expect(await seriesEpisodeAccess(1, 1, {access:"free"})).toEqual({isFree:true,coinCost:0});
    expect(episodeAccess(await episodeDefaults(),3,{})).toEqual({isFree:false,coinCost:12});
    expect(episodeAccess(defaults,5,{access:"locked",coinCost:8})).toEqual({isFree:false,coinCost:8});
    expect(episodeAccess(defaults,6,{access:"free",coinCost:8})).toEqual({isFree:true,coinCost:0});
    await expect(saveEpisodeDefaults("2","-1")).rejects.toThrow("whole number");
    expect(await episodeDefaults()).toEqual({free_opening_episodes:2,locked_coin_price:12});
  });

  it("does not debit legacy free episodes and preserves a spend record when its episode disappears", async () => {
    const free = await unlockEpisode("free","u1","coins");
    expect(free.coinsDeducted).toBe(0);
    expect((await listRecords("unlocks",{type:"free"})).total).toBe(1);
    expect((await listRecords("wallet",{})).total).toBe(0);
    expect((await unlockEpisode("paid","u1","coins")).coinsDeducted).toBe(7);
    const wallet = (await userProfile("u1",{tab:"wallet"})).items[0];
    expect((await recordDetail("wallet",wallet.record_id)).record).toMatchObject({account_id:"u1",episode_title:"Next",coin_amount:-7});
    await pool.query("DELETE FROM episodes WHERE episode_id='paid'");
    expect((await recordDetail("wallet",wallet.record_id)).record).toMatchObject({episode_db_id:null,account_id:"u1",coin_amount:-7});
  });

  it("groups activity by UTC day, distinguishes earlier unavailable days and uses distinct viewers across days", async () => {
    await pool.query("INSERT INTO daily_viewers VALUES ('2026-02-22','u1'),('2026-02-23','u1'),('2026-02-23','u2')");
    await pool.query("INSERT INTO episode_unlocks (user_id,episode_id,method,created_at) VALUES ('u2','free','ad',FROM_UNIXTIME(?))",[Date.parse("2026-02-22T23:59:59Z")/1000]);
    const report = await analyticsReport(7,new Date("2026-02-23T12:00:00Z"));
    expect(report).toMatchObject({unique:2,signups:2,unlocks:1,trackingStart:"2026-02-20"});
    expect(report.daily[0].viewers).toBeNull();
    expect(report.daily.at(-2)).toMatchObject({day:"2026-02-22",signups:2,ad:1,viewers:1});
    expect(report.episodes[0]).toMatchObject({episode_title:"Pilot",n:1});
    expect((await listRecords("unlocks",{type:"ad",from:"2026-02-22",to:"2026-02-22"})).total).toBe(1);
    await expect(listRecords("wallet",{from:"2026-02-31"})).rejects.toThrow("valid calendar");
  });
});
