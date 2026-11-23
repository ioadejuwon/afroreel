import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../auth";
import { config } from "../config";
import { MediaError } from "../cloudflare";
import { authRateLimit } from "../security";
import { permissions, inviteRoles, roleDescriptions, studioHome } from "../studio-access";
import { acceptInvitation, changeMember, emailsFrom, invitationForSetup, inviteRole, resendInvitation, sendInvitation, teamRows } from "../admin-team";

import { requestReset } from "../studio-password";

type Render = (req: Request, res: Response, options: {initialView: string}) => Promise<void>;
export function teamRoutes(render: Render) {
  const router = Router();
  const setup = async (req: Request,res: Response,error = "", status = 200) => {
    const invite = await invitationForSetup(String(req.params.token));
    res.set({"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"})
      .status(invite ? status : 410).render("admin-setup",{invite,csrfToken:req.csrfToken(),error,name:req.body?.name ?? ""});
  };
  router.get("/setup/:token",(req,res) => setup(req,res));
  router.post("/setup/:token",authRateLimit,async (req,res,next) => {
    try {
      const member = await acceptInvitation(String(req.params.token),String(req.body.name || "").trim(),typeof req.body.password === "string" ? req.body.password : "");
      req.session.regenerate(error => {
        if (error) return next(error);
        req.session.adminId = member.id;
        req.session.adminVersion = member.session_version;
        res.redirect(303,res.locals.adminPath + "/" + studioHome(member.role));
      });
    } catch (error) {
      if (!(error instanceof MediaError)) throw error;
      await setup(req,res,error.message,error.status);
    }
  });
  router.use("/team",requireAdmin,(req,res,next) => {
    if (!permissions(req.admin!.role).manageTeam) { res.status(403).send("Owner access required."); return; }
    res.locals.inviteRoles = inviteRoles;
    res.locals.roleDescriptions = roleDescriptions;
    res.locals.results = [];
    next();
  });
  const list = async (req: Request,res: Response) => {
    res.locals.members = await teamRows();
    res.locals.teamFilter = ["active","pending"].includes(String(req.query.filter)) ? req.query.filter : "all";
    await render(req,res,{initialView:"team"});
  };
  router.get("/team",list);
  router.get("/team/invite",(req,res) => {
    res.locals.previewOnly = config.nodeEnv === "development" && !config.resend.apiKey;
    return render(req,res,{initialView:"team-invite"});
  });
  router.post("/team/invite",async (req,res) => {
    const role = inviteRole(req.body.role);
    const message = String(req.body.message || "").trim();
    if ([...message].length>1000) throw new MediaError(400,"Keep the personal message under 1,001 characters.");
    const results = [];
    for (const email of emailsFrom(req.body.emails)) {
      results.push(await sendInvitation(email,role,message,res.locals.adminPath));
    }
    res.locals.results = results;
    await list(req,res);
  });
  router.post("/team/invite/:id/resend",async (req,res) => {
    res.locals.results = [await resendInvitation(Number(req.params.id),res.locals.adminPath)];
    await list(req,res);
  });
  router.post("/team/member/:id/reset",authRateLimit,async (req,res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0 || id === req.admin!.id) throw new MediaError(400,"Select another active member.");
    const sent = await requestReset(id,res.locals.adminPath);
    res.locals.results = [{text:sent ? "Password reset email sent." : "Couldn’t send the password reset email.", resetRetryId:sent ? null : id}];
    await list(req,res);
  });
  for (const action of ["access","remove"]) {
    router.post("/team/:kind/:id/" + action,async (req,res) => {
      await changeMember(req.admin!.id,String(req.params.kind),Number(req.params.id),action === "remove" ? null : inviteRole(req.body.role));
      res.redirect(303,res.locals.adminPath + "/team?saved=1");
    });
  }
  return router;
}
