import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../auth";
import { authRateLimit } from "../security";
import { MediaError } from "../cloudflare";
import { changePassword, redeemReset, requestReset, resetAvailable } from "../studio-password";

export function confirmedPassword(req: Request) {
  if (typeof req.body.password !== "string" || req.body.password !== req.body.confirmation)
    throw new MediaError(400,"The new passwords must match.");
  return req.body.password;
}

export const passwordRouter = Router();
function recovery(req: Request,res: Response,mode: string,message = "",status = 200) {
  res.set({"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"})
    .status(status).render("password-recovery",{mode,message,csrfToken:req.csrfToken()});
}
passwordRouter.get("/forgot-password",(req,res) => recovery(req,res,"forgot"));
passwordRouter.post("/forgot-password",authRateLimit,(req,res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  recovery(req,res,"sent");
  if (email && email.length <= 190) void requestReset(email,res.locals.adminPath).catch(() => console.error("Studio recovery request failed."));
});
passwordRouter.get("/reset-password/:token",async (req,res) => {
  const valid = await resetAvailable(String(req.params.token));
  recovery(req,res,valid ? "reset" : "unavailable","",valid ? 200 : 410);
});
passwordRouter.post("/reset-password/:token",authRateLimit,async (req,res) => {
  try {
    await redeemReset(String(req.params.token),confirmedPassword(req));
    res.redirect(303,res.locals.adminPath+"/login?password=updated");
  } catch (error) {
    if (!(error instanceof MediaError)) throw error;
    recovery(req,res,error.status === 410 ? "unavailable" : "reset",error.message,error.status);
  }
});

type AccountRender = (req: Request,res: Response,options: {initialView:string;status?:number;formError?:string}) => Promise<void>;
export function accountRoutes(render: AccountRender) {
  const router = Router();
  router.get("/account",requireAdmin,(req,res) => render(req,res,{initialView:"account"}));
  router.post("/account",requireAdmin,authRateLimit,async (req,res) => {
    try {
      const member = req.admin!;
      req.session.adminVersion = await changePassword(member.id,member.session_version,req.body.currentPassword,confirmedPassword(req));
      res.redirect(303,res.locals.adminPath+"/account?saved=1");
    } catch (error) {
      if (!(error instanceof MediaError)) throw error;
      await render(req,res,{initialView:"account",status:error.status,formError:error.message});
    }
  });
  return router;
}
