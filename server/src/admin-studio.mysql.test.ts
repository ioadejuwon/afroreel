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
