# Release verification

Production media readiness remains fail-closed. Every real Vercel Production build has `VERCEL_ENV=production`; `npm run build` runs `scripts/assert-media-read-config.cjs` first and rejects the deployment when the durable public snapshot contains R2 media but neither complete R2 credentials nor a valid HTTPS `R2_PUBLIC_BASE_URL` is configured.

For local/daily release verification, run the single command:

```sh
npm run audit:release
```

The audit performs, in order:

1. Regression tests (including the Node 25-compatible legacy suites through pinned `tsx`) and TypeScript typechecking.
2. Read-only production media verification against `https://dispatch.bsmindia.com/api/public/database/health`. When production reports attachments, it also obtains a real public media capability and performs a no-cookie `Range: bytes=0-0` read.
3. An ordinary local `next build`, explicitly outside Vercel Production mode.

This command does not pull, copy, invent, or require production R2 credentials. Production is the authority for its own readiness; local compilation is a separate concern. Set `PRODUCTION_ORIGIN` only when testing the verifier against an equivalent deployment.

`npm run test:audit-preflight` protects the strict Production guard, fail-closed health verification, audit separation, and stable Node 25 test entry points from regression.
