# API Documentation

This document describes all HTTP endpoints exposed by this service.

## Base URL

- Local: `http://localhost:3000`
- Production: `https://<your-domain>`

## Authentication

- Protected admin endpoints require header: `Authorization: Bearer <accessToken>`
- Access token is obtained from `POST /admin/auth/login` or `POST /admin/auth/refresh`

## Common Error Response Format

Most errors follow NestJS standard response shape:

```json
{
  "statusCode": 400,
  "message": "Human readable error message",
  "error": "Bad Request"
}
```

Common status codes:

- `400` Bad Request
- `401` Unauthorized
- `403` Forbidden
- `404` Not Found
- `409` Conflict
- `500` Internal Server Error

## Endpoint Index

- `GET /`
- `POST /admin/auth/login`
- `POST /admin/auth/refresh`
- `GET /admin/auth/me`
- `POST /admin/auth/logout`
- `GET /admin/admins`
- `POST /admin/admins`
- `PATCH /admin/admins/:id`
- `DELETE /admin/admins/:id`
- `GET /admin/overview`
- `GET /admin/users`
- `GET /admin/presentations`
- `POST /admin/presentations/:id/fail`
- `POST /admin/broadcast`
- `POST /telegram/webhook` (or configured `TELEGRAM_WEBHOOK_PATH`)

---

## 1) Health / Greeting

### `GET /`

Returns a simple greeting string.

Example request:

```bash
curl -X GET http://localhost:3000/
```

Example response (`200 OK`):

```json
"Salom Dunyo!"
```

---

## 2) Admin Authentication

### `POST /admin/auth/login`

Authenticate an admin and get access/refresh tokens.

Request body:

```json
{
  "username": "admin",
  "password": "admin123"
}
```

Validation rules:

- `username`: required, 3-50 chars, allowed chars are letters/numbers/`._-` (stored lowercase)
- `password`: required, 8-128 chars

Example request:

```bash
curl -X POST http://localhost:3000/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

Example response (`201 Created`):

```json
{
  "accessToken": "<jwt-access-token>",
  "refreshToken": "<jwt-refresh-token>",
  "admin": {
    "id": 1,
    "name": "Main Admin",
    "username": "admin",
    "role": "SUPERADMIN",
    "createdAt": "2026-02-18T10:00:00.000Z",
    "updatedAt": "2026-02-18T10:00:00.000Z"
  }
}
```

Example error (`401 Unauthorized`):

```json
{
  "statusCode": 401,
  "message": "Invalid credentials.",
  "error": "Unauthorized"
}
```

### `POST /admin/auth/refresh`

Rotate and return new access/refresh tokens.

Request body:

```json
{
  "refreshToken": "<jwt-refresh-token>"
}
```

Example request:

```bash
curl -X POST http://localhost:3000/admin/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<jwt-refresh-token>"
  }'
```

Example response (`201 Created`):

```json
{
  "accessToken": "<new-jwt-access-token>",
  "refreshToken": "<new-jwt-refresh-token>",
  "admin": {
    "id": 1,
    "name": "Main Admin",
    "username": "admin",
    "role": "SUPERADMIN",
    "createdAt": "2026-02-18T10:00:00.000Z",
    "updatedAt": "2026-02-18T10:00:00.000Z"
  }
}
```

Example error (`401 Unauthorized`):

```json
{
  "statusCode": 401,
  "message": "Refresh token is invalid.",
  "error": "Unauthorized"
}
```

### `GET /admin/auth/me`

Get currently authenticated admin profile.

Headers:

- `Authorization: Bearer <accessToken>`

Example request:

```bash
curl -X GET http://localhost:3000/admin/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

Example response (`200 OK`):

```json
{
  "id": 1,
  "name": "Main Admin",
  "username": "admin",
  "role": "SUPERADMIN",
  "createdAt": "2026-02-18T10:00:00.000Z",
  "updatedAt": "2026-02-18T10:00:00.000Z"
}
```

### `POST /admin/auth/logout`

Logout current admin by clearing stored refresh token.

Headers:

- `Authorization: Bearer <accessToken>`

Example request:

```bash
curl -X POST http://localhost:3000/admin/auth/logout \
  -H "Authorization: Bearer <accessToken>"
```

Example response (`201 Created`):

```json
{
  "success": true
}
```

---

## 3) Admin Management (SUPERADMIN only)

All endpoints in this section require:

- `Authorization: Bearer <accessToken>`
- Authenticated admin role: `SUPERADMIN`

### `GET /admin/admins`

List all admin accounts.

Example request:

```bash
curl -X GET http://localhost:3000/admin/admins \
  -H "Authorization: Bearer <accessToken>"
```

Example response (`200 OK`):

```json
[
  {
    "id": 1,
    "name": "Main Admin",
    "username": "admin",
    "role": "SUPERADMIN",
    "createdAt": "2026-02-18T10:00:00.000Z",
    "updatedAt": "2026-02-18T10:00:00.000Z"
  },
  {
    "id": 2,
    "name": "Operator",
    "username": "operator",
    "role": "ADMIN",
    "createdAt": "2026-02-18T12:00:00.000Z",
    "updatedAt": "2026-02-18T12:00:00.000Z"
  }
]
```

Example error (`403 Forbidden`):

```json
{
  "statusCode": 403,
  "message": "SUPERADMIN role is required.",
  "error": "Forbidden"
}
```

### `POST /admin/admins`

Create a new admin account.

Request body:

```json
{
  "name": "Operator",
  "username": "operator",
  "password": "StrongPass123",
  "role": "ADMIN"
}
```

Notes:

- `role` can be `ADMIN` or `SUPERADMIN`
- If `role` is omitted, default is `ADMIN`

Example request:

```bash
curl -X POST http://localhost:3000/admin/admins \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Operator",
    "username": "operator",
    "password": "StrongPass123",
    "role": "ADMIN"
  }'
```

Example response (`201 Created`):

```json
{
  "id": 2,
  "name": "Operator",
  "username": "operator",
  "role": "ADMIN",
  "createdAt": "2026-02-18T12:00:00.000Z",
  "updatedAt": "2026-02-18T12:00:00.000Z"
}
```

Example error (`409 Conflict`):

```json
{
  "statusCode": 409,
  "message": "Admin with the same username already exists.",
  "error": "Conflict"
}
```

### `PATCH /admin/admins/:id`

Update an existing admin account.

Path params:

- `id` (integer, required)

Request body (any subset of fields, at least one is required):

```json
{
  "name": "Updated Operator",
  "username": "operator2",
  "password": "NewStrongPass123",
  "role": "ADMIN"
}
```

Example request:

```bash
curl -X PATCH http://localhost:3000/admin/admins/2 \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Operator"
  }'
```

Example response (`200 OK`):

```json
{
  "id": 2,
  "name": "Updated Operator",
  "username": "operator",
  "role": "ADMIN",
  "createdAt": "2026-02-18T12:00:00.000Z",
  "updatedAt": "2026-02-18T12:30:00.000Z"
}
```

Example error (`400 Bad Request`):

```json
{
  "statusCode": 400,
  "message": "No fields to update.",
  "error": "Bad Request"
}
```

### `DELETE /admin/admins/:id`

Delete an admin account.

Path params:

- `id` (integer, required)

Example request:

```bash
curl -X DELETE http://localhost:3000/admin/admins/2 \
  -H "Authorization: Bearer <accessToken>"
```

Example response (`200 OK`):

```json
{
  "deleted": true,
  "id": 2
}
```

Example error (`400 Bad Request`):

```json
{
  "statusCode": 400,
  "message": "You cannot delete your own account.",
  "error": "Bad Request"
}
```

---

## 4) Admin Operations (ADMIN and SUPERADMIN)

All endpoints in this section require:

- `Authorization: Bearer <accessToken>`

### `GET /admin/overview`

Get dashboard metrics.

Example request:

```bash
curl -X GET http://localhost:3000/admin/overview \
  -H "Authorization: Bearer <accessToken>"
```

Example response (`200 OK`):

```json
{
  "totalUsers": 250,
  "registeredUsers": 170,
  "activeUsers24h": 34,
  "generated24h": 41,
  "pendingJobs": 3,
  "completedJobs": 650,
  "failedJobs": 18
}
```

### `GET /admin/users`

List users with optional search and limit.

Query params:

- `search` (optional): search by `telegramId`, `username`, `firstName`, `phoneNumber`
- `limit` (optional): positive integer, default `60`, max `200`

Example request:

```bash
curl -X GET "http://localhost:3000/admin/users?search=john&limit=20" \
  -H "Authorization: Bearer <accessToken>"
```

Example response (`200 OK`):

```json
[
  {
    "id": 10,
    "telegramId": "123456789",
    "firstName": "John",
    "username": "john_doe",
    "phoneNumber": "+998901234567",
    "createdAt": "2026-02-17T09:22:11.000Z",
    "totalGenerations": 7,
    "usedToday": 1,
    "lastGenerationAt": "2026-02-18T08:10:00.000Z"
  }
]
```

Example error (`400 Bad Request`):

```json
{
  "statusCode": 400,
  "message": "Limit must be a positive integer.",
  "error": "Bad Request"
}
```

### `GET /admin/presentations`

List presentations with optional status filter and limit.

Query params:

- `status` (optional): one of `pending`, `completed`, `failed`
- `limit` (optional): positive integer, default `30`, max `200`

Example request:

```bash
curl -X GET "http://localhost:3000/admin/presentations?status=pending&limit=15" \
  -H "Authorization: Bearer <accessToken>"
```

Example response (`200 OK`):

```json
[
  {
    "id": 101,
    "status": "pending",
    "createdAt": "2026-02-18T08:30:00.000Z",
    "telegramId": "123456789",
    "firstName": "John",
    "username": "john_doe",
    "metadata": {
      "prompt": "AI in healthcare",
      "language": "en",
      "templateId": 2,
      "pageCount": 6,
      "useImages": true,
      "briefAnswers": {
        "targetAudience": "Medical students",
        "presenterRole": "Professor",
        "presentationGoal": "Teach fundamentals",
        "toneStyle": "Professional"
      },
      "fileName": "ai-healthcare.pdf"
    }
  }
]
```

Example error (`400 Bad Request`):

```json
{
  "statusCode": 400,
  "message": "Presentation status is invalid.",
  "error": "Bad Request"
}
```

### `POST /admin/presentations/:id/fail`

Mark a presentation as failed only if current status is `pending`.

Path params:

- `id` (integer, required)

Example request:

```bash
curl -X POST http://localhost:3000/admin/presentations/101/fail \
  -H "Authorization: Bearer <accessToken>"
```

Example response (`201 Created`):

```json
{
  "updated": true
}
```

Behavior note:

- Returns `{ "updated": false }` if presentation does not exist or is not `pending`.

### `POST /admin/broadcast`

Send a broadcast message to all users with a registered phone number.

Request body:

```json
{
  "message": "Hello everyone! New templates are now available."
}
```

Validation rules:

- `message`: required, max 4096 chars

Example request:

```bash
curl -X POST http://localhost:3000/admin/broadcast \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello everyone! New templates are now available."
  }'
```

Example response (`201 Created`):

```json
{
  "recipients": 170,
  "sent": 165,
  "failed": 5
}
```

Example error (`400 Bad Request`):

```json
{
  "statusCode": 400,
  "message": "Message is required.",
  "error": "Bad Request"
}
```

---

## 5) Telegram Webhook Endpoint

### `POST /telegram/webhook`

Receives Telegram updates. This endpoint is handled by Telegraf webhook callback middleware.

Important:

- Actual path is configurable via `TELEGRAM_WEBHOOK_PATH`
- Default path is `/telegram/webhook`
- If `TELEGRAM_WEBHOOK_SECRET_TOKEN` is set, Telegram sends header:
  `X-Telegram-Bot-Api-Secret-Token: <secret>`
- Intended for Telegram servers, not for public/manual use

Example request (simplified Telegram update):

```bash
curl -X POST http://localhost:3000/telegram/webhook \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: <secret>" \
  -d '{
    "update_id": 123456789,
    "message": {
      "message_id": 1,
      "date": 1700000000,
      "text": "/start",
      "chat": { "id": 123456789, "type": "private" },
      "from": { "id": 123456789, "is_bot": false, "first_name": "John" }
    }
  }'
```

Example response:

- `200 OK` (body may be empty or framework-generated)

---

## Notes

- Date fields are serialized as ISO-8601 strings in JSON responses.
- For protected endpoints, malformed/missing auth header returns `401`.
- Access token TTL is 15 minutes; refresh token TTL is 7 days.
