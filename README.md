# AfroReel

AfroReel is a vertical-drama streaming prototype with three parts:

- an Expo/React Native mobile app in `mobile/`;
- an Express and EJS administration server in `server/` and `admin/`;
- a MySQL schema in `database/admin_schema.sql`.

The server exposes the mobile JSON API and the browser-based admin CMS from the same process.

## Prerequisites

- Node.js 22 or newer
- npm
- MySQL 8 or compatible MariaDB
- Expo Go or an iOS/Android simulator for the mobile app

## Local setup

Install both dependency trees:

```sh
npm ci
npm --prefix mobile ci
```

Create the local server configuration:

```sh
cp .env.example .env
```

Set a long, random `SESSION_SECRET` and update the database credentials in `.env`.

Create the database and tables:

```sh
npm run db:migrate
```

Create or rotate the first admin without committing credentials:

```sh
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='a-long-random-password' npm run admin:bootstrap
```

Start the API and admin server:

```sh
npm run dev
```

The admin is available at [http://localhost:3000/admin](http://localhost:3000/admin).

In a second terminal, start Expo:

```sh
npm --prefix mobile start
```

The app normally derives the API host from Expo. To use a different server, create `mobile/.env` containing:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:3000
```

Use an address reachable from the phone or simulator; `localhost` on a physical phone refers to the phone itself.

## Configuration

The server reads these variables from `.env`:

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port; defaults to `3000` |
| `NODE_ENV` | Use `production` to enable secure session cookies |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` | MySQL connection |
| `DB_SOCKET_PATH` | Optional Unix socket for local MySQL |
| `SESSION_SECRET` | Required secret used to sign admin sessions |
| `PUBLIC_BASE_URL` | Optional externally visible server URL |
| `APP_BASE_PATH` | Optional path prefix for subdirectory deployments |
| `UPLOAD_DIR` | Optional upload location; defaults to `uploads` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Stream account |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Stream API token |
| `CLOUDFLARE_STREAM_CUSTOMER_CODE` | Cloudflare Stream playback customer code |
| `ALLOW_LOCAL_MEDIA` | Enables the local media fallback in development |

See the [Cloudflare setup and smoke test](docs/production-runbook.md#cloudflare-provisioning) for signing keys, Images variants, and the webhook. With the development fallback enabled, existing local media stays available while you replace it.

## Quality checks

Run the same checks used by continuous integration:

```sh
npm test
npm --prefix mobile run type-check
npm --prefix mobile run lint
```

`npm run build` compiles the server into `dist/` for deployment. Production starts it with `npm start`.

## Current limitations

- Production disables prototype wallet top-ups and unverified ad unlocks. Configure Apple/Google verification credentials, store webhooks, AdMob rewarded units, and SSV before enabling monetization; see `docs/monetization-setup.md`.
- Automated integration tests have not yet been added; current checks cover TypeScript and linting.
- The mobile entry screen is being split into services, types, screens, hooks, and reusable components incrementally.
