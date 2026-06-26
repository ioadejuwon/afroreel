import path from "node:path";
import express, { type ErrorRequestHandler } from "express";
import session from "express-session";
import createMySQLSession from "express-mysql-session";
import csrf from "csurf";
import { config, isProduction } from "./config";
import { attachCurrentAdmin } from "./auth";
import { adminRouter } from "./routes/admin";
import { apiRouter } from "./routes/api";
import { ensureUploadDirs, uploadRoot } from "./uploads";
import { ensureContentSchema } from "./content";

const app = express();
const projectRoot = process.cwd();
const adminAssetsDir = path.join(projectRoot, "admin");
const viewsDir = path.join(projectRoot, "server", "views");
const MySQLStore = createMySQLSession(session);
const inferredCpanelBasePath = projectRoot.split(path.sep).includes("public_html") ? `/${path.basename(projectRoot)}` : "";
const basePaths = Array.from(new Set(["", config.basePath, inferredCpanelBasePath]));
const withBasePath = (basePath: string, route: string): string => (route === "/" ? basePath || "/" : `${basePath}${route}`);
const defaultBasePath = config.basePath || inferredCpanelBasePath;

function requestBasePath(originalUrl: string): string {
  return [...basePaths]
    .sort((a, b) => b.length - a.length)
    .find((basePath) => basePath && (originalUrl === basePath || originalUrl.startsWith(`${basePath}/`))) ?? defaultBasePath;
}

app.set("view engine", "ejs");
app.set("views", viewsDir);
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.locals.basePath = defaultBasePath;
app.locals.adminPath = withBasePath(defaultBasePath, "/admin");

app.use((req, res, next) => {
  const basePath = requestBasePath(req.originalUrl);
  res.locals.basePath = basePath;
  res.locals.adminPath = withBasePath(basePath, "/admin");
  next();
});

app.use(express.urlencoded({ extended: false, limit: "3mb" }));
app.use(express.json({ limit: "3mb" }));
for (const basePath of basePaths) {
  app.use(withBasePath(basePath, "/uploads"), express.static(uploadRoot(), { immutable: true, maxAge: "30d" }));
  app.use(withBasePath(basePath, "/api"), apiRouter);
}

app.use(
  session({
    name: config.session.name,
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    store: new MySQLStore({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      charset: "utf8mb4_bin",
      createDatabaseTable: true,
      schema: {
        tableName: "admin_sessions",
        columnNames: {
          session_id: "session_id",
          expires: "expires",
          data: "data",
        },
      },
    }),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: undefined,
    },
  }),
);

app.use(csrf());
app.use(attachCurrentAdmin);

for (const basePath of basePaths) {
  const adminPath = withBasePath(basePath, "/admin");

  app.get(withBasePath(basePath, "/admin/styles.css"), (_req, res) => {
    res.sendFile(path.join(adminAssetsDir, "styles.css"));
  });

  app.get(withBasePath(basePath, "/admin/app.js"), (_req, res) => {
    res.sendFile(path.join(adminAssetsDir, "app.js"));
  });

  app.use(adminPath, adminRouter);
  app.get(withBasePath(basePath, "/"), (_req, res) => res.redirect(adminPath));
}

const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error.code === "EBADCSRFTOKEN") {
    const csrfToken = typeof req.csrfToken === "function" ? req.csrfToken() : "";

    res.status(403).render("login", {
      admin: null,
      csrfToken,
      error: "Your session expired. Please try again.",
    });
    return;
  }

  console.error(error);
  if (req.path.includes("/api/")) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
    return;
  }

  res.status(500).send("Internal server error");
};

app.use(errorHandler);

async function start(): Promise<void> {
  await ensureUploadDirs();
  await ensureContentSchema();

  app.listen(config.port, () => {
    console.log(`AfroReel admin server listening at http://localhost:${config.port}${withBasePath(config.basePath, "/admin")}`);
  });
}

void start();
