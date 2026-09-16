# Media retention

- Packing and loading **videos**: maximum 21 days from `uploadedAt`, then physical R2 deletion.
- LR/builty and payment documents: 30 days from upload.
- Photos are not videos and are not shortened by the 21-day policy.

The daily Vercel cron calls `GET /api/media-proof/cleanup` at `02:00 UTC`. An authorized
Vercel cron request executes deletion by default. An interactive Admin GET is a dry-run unless
`execute=true` is supplied. Deletion is fail-closed: R2 HEAD absence is verified before metadata
is cleared. Inventory reconciliation covers legacy mixed-prefix videos by extension. Native R2
lifecycle rules are limited to the video-only `media-proof/packing/` and `media-proof/loading/`
prefixes; a broad `media-proof/` rule must never be used.