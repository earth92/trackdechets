import { Router } from "express";
import passport from "passport";
import querystring from "querystring";
import { ADMIN_IS_PERSONIFYING } from "../auth";
import nocache from "../common/middlewares/nocache";
import { rateLimiterMiddleware } from "../common/middlewares/rateLimiter";
import { storeUserSessionsId } from "../common/redis/users";
import { getUIBaseURL, sanitizeEmail } from "../utils";

const UI_BASE_URL = getUIBaseURL();

const windowMs = 1000 * 60;
const maxRequestsPerWindow = process.env.NODE_ENV === "test" ? 1000 : 10;

export const authRouter = Router();
authRouter.post(
  "/login",
  rateLimiterMiddleware({
    windowMs,
    maxRequestsPerWindow,
    keyGenerator: (ip, request) => {
      const { email } = request.body;
      return `login_${ip}_${email ? sanitizeEmail(email) : "void"}`;
    }
  }),
  (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        const queries = {
          ...{
            errorCode: info.code,
            username: info.username
          },
          ...(req.body.returnTo ? { returnTo: req.body.returnTo } : {})
        };

        return res.redirect(
          `${UI_BASE_URL}/login?${querystring.stringify(queries)}`
        );
      }
      req.logIn(user, () => {
        if (info?.message === ADMIN_IS_PERSONIFYING) {
          // when personifying a user account we reduce the session duration to 1 hour and display a message
          const oneHourInMs = 3600000;
          req.session.cookie.maxAge = oneHourInMs;
          req.session.warningMessage = `Attention, vous êtes actuellement connecté avec le compte utilisateur ${user.email} pour une durée de 1 heure.`;
        }
        storeUserSessionsId(user.id, req.session.id);
        const returnTo = req.body.returnTo || "/";
        return res.redirect(`${UI_BASE_URL}${returnTo}`);
      });
    })(req, res, next);
  }
);

authRouter.get("/isAuthenticated", nocache, (req, res) => {
  return res.json({ isAuthenticated: req.isAuthenticated() });
});

authRouter.post("/logout", (req, res, next) => {
  req.logout(err => {
    if (err) {
      return next(err);
    }

    res.redirect(UI_BASE_URL);
  });
});
