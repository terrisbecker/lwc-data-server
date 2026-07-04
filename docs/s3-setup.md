# S3 Bucket Setup Guide

This guide covers creating and configuring the AWS S3 bucket that backs the image
upload feature (`/api/uploads/*`). It is written to match the deployment described
in [`production.md`](./production.md): the API runs on an EC2 instance, and AWS
credentials come from the instance's IAM role — no static access keys.

## How the architecture uses S3

The server **never touches the file bytes**. It only signs short-lived URLs; the
browser uploads and downloads directly to and from S3. Understanding this flow is
what makes the bucket config obvious:

```
1. Client  → POST /api/uploads/presigned-urls   (JWT, volunteer+)
   Server  → creates a `pending` row in Postgres, returns a presigned PUT URL
             (Content-Type baked into the signature, expires in 5 min)

2. Client  → PUT <presignedUrl>  with the raw file bytes   (direct to S3)

3. Client  → POST /api/uploads/confirm            (marks rows `confirmed`)

4. Client  → GET  /api/uploads/:id/url            (returns a presigned GET URL,
             expires in 15 min) → browser GETs the object directly from S3
```

Consequences for the bucket:

- The bucket stays **fully private** — access is granted per-object, per-request
  by the presigned URLs. No public access, no bucket policy for reads.
- Because the **browser** talks to S3 in steps 2 and 4, the bucket needs a **CORS**
  configuration allowing your frontend origin. This is separate from the API's
  own `CORS_ALLOWED_ORIGINS`.
- The **server** only needs permission to *sign* `PutObject` / `GetObject`
  requests — it never lists, uploads, or deletes objects itself.
- Object keys follow the pattern `uploads/<userId>/<uuid>.<ext>`
  (`src/uploads/uploads.service.ts`), so IAM and lifecycle rules can scope to the
  `uploads/*` prefix.

---

## Prerequisites

- An AWS account with permission to create S3 buckets and edit IAM roles.
- The EC2 instance from the production guide (or a local machine with AWS
  credentials configured — see [Local development](#local-development-credentials)).
- The AWS region you want the bucket in. It **must** match the `AWS_REGION` the
  server runs with.

---

## 1. Create the bucket

Console: **S3 → Create bucket**. CLI equivalent shown below.

- **Bucket name** — globally unique, e.g. `lwc-data-uploads-prod`. This is the
  value you'll set as `S3_BUCKET_NAME`.
- **Region** — pick the region the API runs in (e.g. `us-east-1`). A region
  mismatch between the bucket and `AWS_REGION` causes presigned URLs to fail with
  signature or redirect (`301 PermanentRedirect`) errors.
- **Block Public Access** — leave **all four settings ON**. Nothing is ever served
  publicly; presigned URLs handle every read and write.
- **Bucket Versioning** — optional. Off is fine; enable it if you want to recover
  from accidental overwrites (object keys include a UUID so overwrites are already
  unlikely).
- **Default encryption** — enable **SSE-S3 (`AES256`)**. It is transparent to the
  presigned PUTs the app generates, because the code sends no encryption headers.

```bash
aws s3api create-bucket \
  --bucket lwc-data-uploads-prod \
  --region us-east-1
# For regions other than us-east-1, add:
#   --create-bucket-configuration LocationConstraint=<region>

# Enforce encryption at rest
aws s3api put-bucket-encryption \
  --bucket lwc-data-uploads-prod \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Belt-and-suspenders: keep public access blocked
aws s3api put-public-access-block \
  --bucket lwc-data-uploads-prod \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

---

## 2. Configure CORS (required)

Both the upload (`PUT`) and download (`GET`) happen in the browser, so S3 must
send CORS headers for your frontend origin. Without this, the direct upload fails
in the browser with a CORS error even though the presigned URL is valid.

Console: **bucket → Permissions → Cross-origin resource sharing (CORS) → Edit**.

```json
[
  {
    "AllowedOrigins": [
      "https://your-frontend-domain.com",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

CLI:

```bash
aws s3api put-bucket-cors \
  --bucket lwc-data-uploads-prod \
  --cors-configuration file://cors.json
```

Notes:

- List **every** browser origin that will upload — production domain(s) and any
  local dev origin (e.g. Vite's `http://localhost:5173`). Origins must match
  scheme + host + port exactly.
- This is **not** the same as the server's `CORS_ALLOWED_ORIGINS` env var. That
  one lets the browser call the Express API (steps 1, 3, 4 above); this bucket
  CORS lets the browser call S3 directly (steps 2 and 4's final GET). Both must
  include your frontend origin.
- `AllowedHeaders: ["Content-Type"]` is needed because the client sends a
  `Content-Type` header on the PUT that must match the signed value.

---

## 3. Grant the server permission via IAM

`src/s3.ts` constructs the client as `new S3Client({ region })` with **no
credentials**, so the SDK resolves them from the default provider chain. On EC2
that is the **IAM instance role**. Attach a narrowly-scoped policy to that role.

### Policy (least privilege)

The server only needs to *sign* `PutObject` and `GetObject` requests for objects
under the `uploads/` prefix. It does **not** list the bucket or delete objects.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LwcUploadsReadWrite",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::lwc-data-uploads-prod/uploads/*"
    }
  ]
}
```

### Attaching it to the EC2 instance role

1. **IAM → Policies → Create policy**, paste the JSON above (replace the bucket
   name), name it e.g. `lwc-uploads-s3`.
2. **IAM → Roles →** the role attached to your EC2 instance (or create one and
   attach it under **EC2 → Instance → Actions → Security → Modify IAM role**).
3. Attach the `lwc-uploads-s3` policy to that role.

No access keys are stored anywhere, and nothing changes in `.env` beyond the two
variables in the next step.

---

## 4. Set the environment variables

`src/s3.ts` **throws at startup** if either variable is missing (fail-closed, the
same pattern as `JWT_SECRET`). Add both to the server's `.env`:

```dotenv
# AWS region where the bucket lives — must match the bucket's region
AWS_REGION=us-east-1

# The bucket name from step 1
S3_BUCKET_NAME=lwc-data-uploads-prod
```

Then restart the app (`pm2 restart lwc-data-server`).

> On EC2 you do **not** set `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — the
> instance role supplies credentials automatically. See
> [Local development](#local-development-credentials) for running off-instance.

---

## 5. Apply the database migration

The upload feature adds a new `upload` table (in the `users` Postgres schema).
Apply migrations on the server before exercising the endpoints:

```bash
npx prisma migrate deploy
```

The `upload` row is created in `pending` state when a presigned URL is issued and
flipped to `confirmed` by `POST /api/uploads/confirm`. Reads
(`GET /api/uploads`, `GET /api/uploads/:id/url`) only return `confirmed` rows.

---

## 6. Verify end to end

With the server running and a volunteer (or admin) JWT in `$TOKEN`:

```bash
# 1. Request a presigned PUT URL
RESP=$(curl -s -X POST http://localhost:3001/api/uploads/presigned-urls \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"files":[{"filename":"test.jpg","contentType":"image/jpeg","sizeBytes":12345}]}')
echo "$RESP"

UPLOAD_ID=$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['data'][0]['uploadId'])")
PUT_URL=$(echo "$RESP"  | python3 -c "import sys,json;print(json.load(sys.stdin)['data'][0]['presignedUrl'])")

# 2. PUT the bytes directly to S3 — Content-Type MUST match what was declared
curl -X PUT "$PUT_URL" -H "Content-Type: image/jpeg" --data-binary @test.jpg

# 3. Confirm
curl -s -X POST http://localhost:3001/api/uploads/confirm \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"uploadIds\":[\"$UPLOAD_ID\"]}"

# 4. Get a presigned download URL and fetch the object
DL=$(curl -s http://localhost:3001/api/uploads/$UPLOAD_ID/url \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['url'])")
curl -s "$DL" -o roundtrip.jpg && echo "Downloaded $(wc -c < roundtrip.jpg) bytes"
```

If all four steps succeed and `roundtrip.jpg` matches `test.jpg`, the bucket is
wired up correctly.

---

## Recommended hardening

These are optional but recommended for a real deployment.

### Lifecycle rule for abandoned uploads

A client can request a presigned URL (creating a `pending` row) and never PUT, or
PUT and never confirm. Add a lifecycle rule so orphaned objects don't accumulate,
and clean up stale `pending` rows in Postgres separately.

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket lwc-data-uploads-prod \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "abort-incomplete-multipart",
        "Filter": {"Prefix": "uploads/"},
        "Status": "Enabled",
        "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 1}
      }
    ]
  }'
```

### Enforce TLS on the bucket

Add a bucket policy denying any non-HTTPS request. (This is a *deny* policy, so it
does not open the bucket to public access.)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::lwc-data-uploads-prod",
        "arn:aws:s3:::lwc-data-uploads-prod/*"
      ],
      "Condition": {"Bool": {"aws:SecureTransport": "false"}}
    }
  ]
}
```

---

## Known limitation: upload size is not enforced by S3

The API validates a **declared** `sizeBytes` (max 10 MB) in
`src/uploads/uploads.controller.ts`, but a presigned `PutObject` URL carries **no
size condition** — a client can PUT a file larger than it declared and S3 will
accept it. To enforce the cap at S3, the code would need to switch from presigned
`PutObject` URLs to a **presigned POST** (`createPresignedPost`) with a
`content-length-range` condition. Until then, treat the 10 MB limit as advisory
and rely on it only as a first-pass client-side check.

---

## Local development credentials

Off-instance (e.g. a laptop), there is no IAM instance role, so supply credentials
through the standard AWS provider chain — pick one:

```bash
# Option A: a named profile from ~/.aws/credentials
export AWS_PROFILE=lwc-dev

# Option B: explicit keys in the environment
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
```

Still set `AWS_REGION` and `S3_BUCKET_NAME` (the app requires them). Use an IAM
**user** whose policy matches the least-privilege policy in step 3. You can point
local dev at the same bucket or a separate `lwc-data-uploads-dev` bucket; if you
use a separate bucket, add your local origin (`http://localhost:5173`) to its CORS
config.

---

## Troubleshooting

### Server exits at startup with an `AWS_REGION` / `S3_BUCKET_NAME` error

`src/s3.ts` throws if either is unset. Add both to `.env` and restart.

### Browser upload fails with a CORS error

The bucket CORS config is missing the frontend origin, or lists the wrong
scheme/port. Re-check step 2 — origins must match exactly. Remember this is bucket
CORS, distinct from the API's `CORS_ALLOWED_ORIGINS`.

### PUT returns `403 SignatureDoesNotMatch`

The `Content-Type` header on the PUT does not match the `contentType` sent when
requesting the URL (it is baked into the signature), or the URL expired (5-minute
window). Regenerate the URL and send the identical `Content-Type`.

### PUT/GET returns `301 PermanentRedirect` or a signature error

The bucket's region does not match `AWS_REGION`. They must be identical.

### `403 AccessDenied` when the server signs or the client uses the URL

The IAM role/user is missing `s3:PutObject`/`s3:GetObject` on
`arn:aws:s3:::<bucket>/uploads/*`, or the resource ARN in the policy doesn't cover
the object key prefix. Confirm the policy from step 3 is attached to the EC2
instance role.

### Endpoints return `404` for an object you know exists

Reads only return `confirmed` uploads. Make sure `POST /api/uploads/confirm` ran
after the PUT, and that the requesting user is the same one that owns the upload
(ownership is enforced in `getPresignedGetUrl`).

---

## Related documentation

- [`production.md`](./production.md) — full EC2 + RDS deployment guide.
- `README.md` — API reference for the `/api/uploads/*` endpoints.
- `.claude/CLAUDE.md` — architecture overview and middleware chain.
