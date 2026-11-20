# Production runbook

## Required environments

| Environment | API | Database | Cloudflare | Mobile channel |
| --- | --- | --- | --- | --- |
| Staging | `https://staging-api.rellowmedia.com` | Dedicated staging schema | Dedicated test Stream/Images assets | Unassigned |
| Production | `https://rellowmedia.com/afroreel` | Dedicated production schema | Production Stream/Images assets | `preview` and `production` |

Before enabling deployment, confirm cPanel provides SSH, a persistent Node 22 application, environment variables, MySQL, TLS proxying, logs, cron, and a Passenger restart mechanism. If any are unavailable, deploy the API to managed Node hosting while retaining Namecheap DNS.

## GitHub environments

Create protected `staging` and `production` environments. Require manual reviewers for production and define `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`, `DEPLOY_SSH_KEY`, and `HEALTHCHECK_URL` secrets in each environment. Production deployment is permitted only from a `v*` tag or an explicitly approved workflow dispatch.

## Deployment

### cPanel Git Version Control

The production checkout is `~/public_html/afroreel` on branch `main`. Save the production settings in its `.env`, including `PUBLIC_BASE_URL=https://rellowmedia.com/afroreel` and `APP_BASE_PATH=/afroreel`. Set the Node 22 application startup file to `dist/server/src/index.js`.

In **Git Version Control → Manage → Pull or Deploy**, select **Update from Remote**, review the HEAD commit, then select **Deploy HEAD Commit**. The deploy task builds that revision in a private directory under `~/afroreel-releases`, saves a MySQL dump there before applying migrations, switches Passenger to the compiled build, and checks the public readiness endpoint. Each release records the previous Passenger entry for recovery. Keep the active release directory while it is serving traffic.

### SSH workflow

1. Back up MySQL using credentials stored on the host, never in Git.
2. Deploy the exact Git revision.
3. Run `npm ci`, `npm run build`, and `npm run db:migrate`.
4. Restart Passenger by touching `tmp/restart.txt`.
5. Require `/health/ready` to succeed before announcing the deployment.
6. Roll application code back to the previous tag if health checks fail. Database migrations must remain forward compatible.

## Cloudflare provisioning

Use separate Cloudflare resources for staging and production. Put these variables in the API server's environment.

- Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` with Stream Write permission, and `CLOUDFLARE_STREAM_CUSTOMER_CODE` from Stream's delivery hostname. Create a [Stream signing key](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/#option-3-using-a-signing-key-to-create-signed-tokens) and save its returned `id` and base64 `pem` under `CLOUDFLARE_STREAM_KEY_ID` and `CLOUDFLARE_STREAM_PRIVATE_KEY_PEM_BASE64`.
- Enable [hosted Cloudflare Images](https://developers.cloudflare.com/images/pricing/). Set `CLOUDFLARE_IMAGES_API_TOKEN` with Images Write permission and `CLOUDFLARE_IMAGES_DELIVERY_HASH` from Images → Developer Resources. Create `postercard` (360 × 540), `posterdetail` (720 × 1080), and `adminpreview` (240 × 360), with Cover fit and metadata removed. Series posters use public delivery. [Cloudflare variant setup](https://developers.cloudflare.com/images/optimization/hosted-images/create-variants/)
- Register each account's Stream VOD webhook at its own HTTPS API endpoint, `/webhooks/cloudflare/stream`. Copy the returned secret into `CLOUDFLARE_STREAM_WEBHOOK_SECRET`. Test with a new upload and leave the production webhook pointed at the production API during staging tests. [Cloudflare webhook setup](https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/)

After deploying episode previews, run `npm run previews:backfill` against the catalog for that environment. It imports a 480 × 600 still from each existing ready Stream video into Cloudflare Images using the `public` variant. New videos and replacements use the same import when ready. Re-run the command after resolving an import error. Completed previews are skipped.

### Local media smoke test

1. For a socket-based MAMP installation, set `DB_SOCKET_PATH=/Applications/MAMP/tmp/mysql/mysql.sock` in the server's local environment. Set `ALLOW_LOCAL_MEDIA=true` to keep using existing local files during the switch. Back up MySQL, then run `npm run db:migrate` before starting the API.
2. In Admin → Series → Manage Episodes, select an episode and upload its replacement. Re-select the same file in the same tab to resume an interrupted upload. Use **Refresh status** if processing takes longer than the automatic local checks. The current video stays available until Stream confirms its replacement is ready.
3. Use **Replace poster** on that series to verify the Images flow. Keep the prior files until the app smoke test passes. The series retains its legacy poster path for development rollback.
4. On the iPhone development build, refresh the catalog and open the episode. Check the Network panel in the admin browser and playback requests on the device. Browser media uploads go to Cloudflare. The API returns JSON with Cloudflare delivery URLs. The iPhone loads posters, thumbnails, and HLS from Cloudflare.

After the local test, verify signed webhooks on staging before promoting the change. Staging and production require Cloudflare for new uploads and keep the local upload routes disabled.

## Backups and recovery

Run encrypted daily MySQL backups with 30-day retention and a separate weekly copy. Perform a staging restore test monthly. Record restore duration and row-count validation in the release log.
