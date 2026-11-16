// OpenAPI 3.0 description of the API, served by Swagger UI at /api/docs (raw JSON at /api/docs.json).
const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
const json = (schema: object, example?: unknown) => ({
  "application/json": { schema, ...(example !== undefined ? { example } : {}) },
});
const res = (description: string, schema?: object) => ({
  description,
  ...(schema ? { content: json(schema) } : {}),
});
const errors = (...codes: number[]) =>
  Object.fromEntries(
    codes.map((c) => [
      String(c),
      {
        description: {
          400: "Validation error",
          401: "Missing/invalid/expired token",
          403: "Forbidden",
          404: "Not found (also for other organizations' resources)",
          409: "Conflict with current state",
        }[c],
        content: json(ref("Error")),
      },
    ]),
  );
const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const secured = [{ cookieAuth: [] }];
const campaignAction = (
  summary: string,
  description: string,
  okCode: "200" | "202",
  okSchema: object,
) => ({
  post: {
    tags: ["Campaigns"],
    summary,
    description,
    security: secured,
    parameters: [idParam],
    responses: { [okCode]: res("OK", okSchema), ...errors(401, 404, 409) },
  },
});
const campaignWrap = {
  type: "object",
  properties: { campaign: ref("Campaign") },
};

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Smart Notification & Campaign Processing Engine",
    version: "1.0.0",
    description:
      "Bulk SMS campaigns processed asynchronously with BullMQ (SMS delivery is mocked).\n\n" +
      "**How to use:** call `POST /api/auth/register` or `POST /api/auth/login`. " +
      "The server sets HttpOnly `accessToken` and `refreshToken` cookies; call `POST /api/auth/refresh` when the access token expires.\n\n" +
      "**Mock recipients for demos:** `...8888` fails twice then succeeds, `...9999` always fails, `...7777` provider accepts then the worker 'crashes' once, malformed numbers fail permanently.",
  },
  servers: [{ url: "/", description: "This server" }],
  tags: [
    { name: "Auth" },
    { name: "Campaigns" },
    { name: "Messages" },
    { name: "Notifications" },
    { name: "Queues" },
    { name: "System" },
  ],
  components: {
    securitySchemes: {
      cookieAuth: { type: "apiKey", in: "cookie", name: "accessToken" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "NOT_FOUND" },
              message: { type: "string" },
              details: { type: "array", items: { type: "object" } },
            },
          },
        },
      },
      CampaignStatus: {
        type: "string",
        enum: [
          "PENDING",
          "QUEUED",
          "PROCESSING",
          "PAUSED",
          "COMPLETED",
          "FAILED",
          "CANCELLED",
        ],
      },
      MessageStatus: {
        type: "string",
        enum: ["PENDING", "PROCESSING", "SENT", "FAILED"],
      },
      Organization: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          orgId: { type: "string", example: "org_5b17f0f3488b" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      AuthSession: {
        type: "object",
        properties: {
          accessTokenExpiresIn: { type: "string", example: "15m" },
          refreshTokenExpiresIn: { type: "string", example: "7d" },
          organization: ref("Organization"),
        },
      },
      RegisterRequest: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", example: "Acme Corp" },
          email: {
            type: "string",
            format: "email",
            example: "acme@example.com",
          },
          password: { type: "string", minLength: 8, example: "Passw0rd!123" },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: {
            type: "string",
            format: "email",
            example: "acme@example.com",
          },
          password: { type: "string", example: "Passw0rd!123" },
        },
      },
      CreateCampaignRequest: {
        type: "object",
        required: ["name", "content", "recipients"],
        properties: {
          name: { type: "string", maxLength: 200, example: "Black Friday" },
          content: {
            type: "string",
            maxLength: 1600,
            example: "Hi! 20% off today.",
          },
          recipients: {
            type: "array",
            minItems: 1,
            maxItems: 100000,
            items: { type: "string", example: "+15551230001" },
            description: "Duplicates are removed.",
          },
          scheduledAt: {
            type: "string",
            format: "date-time",
            description:
              "Must be in the future. Include an offset, e.g. 2026-11-15T15:55:00+05:45.",
            example: "2026-11-20T09:00:00+05:45",
          },
          autoStart: {
            type: "boolean",
            default: true,
            description:
              "false keeps the campaign PENDING until POST /{id}/start.",
          },
          orgId: {
            type: "string",
            description:
              "Optional. Must equal the orgId in your token, otherwise 403.",
          },
        },
      },
      Campaign: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          status: ref("CampaignStatus"),
          scheduledAt: { type: "string", format: "date-time", nullable: true },
          totalMessages: { type: "integer" },
          organizationId: { type: "string", example: "org_5b17f0f3488b" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Progress: {
        type: "object",
        properties: {
          campaignId: { type: "string", format: "uuid" },
          status: ref("CampaignStatus"),
          total: { type: "integer" },
          pending: { type: "integer" },
          processing: { type: "integer" },
          sent: { type: "integer" },
          failed: { type: "integer" },
          percentComplete: { type: "number", example: 42.5 },
          scheduledAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      CampaignDetails: {
        allOf: [
          ref("Campaign"),
          { type: "object", properties: { progress: ref("Progress") } },
        ],
      },
      Message: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          recipient: { type: "string" },
          status: ref("MessageStatus"),
          attempts: { type: "integer" },
          providerReference: { type: "string", nullable: true },
          sentAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      MessageDetails: {
        allOf: [
          ref("Message"),
          {
            type: "object",
            properties: {
              campaignId: { type: "string", format: "uuid" },
              queueJob: {
                type: "object",
                nullable: true,
                properties: {
                  id: { type: "string" },
                  state: { type: "string" },
                  attemptsMade: { type: "integer" },
                  failedReason: { type: "string", nullable: true },
                },
              },
            },
          },
        ],
      },
      Notification: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string" },
          campaignId: { type: "string", format: "uuid", nullable: true },
          type: {
            type: "string",
            enum: [
              "CAMPAIGN_CREATED",
              "CAMPAIGN_SCHEDULED",
              "CAMPAIGN_STARTED",
              "CAMPAIGN_COMPLETED",
              "CAMPAIGN_FAILED",
            ],
          },
          message: { type: "string" },
          status: { type: "string", enum: ["UNREAD", "READ"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Page: {
        type: "object",
        properties: {
          page: { type: "integer" },
          limit: { type: "integer" },
          total: { type: "integer" },
          totalPages: { type: "integer" },
        },
      },
      QueueStats: {
        type: "object",
        properties: {
          timestamp: { type: "string", format: "date-time" },
          queues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", example: "message-queue" },
                paused: { type: "boolean" },
                counts: {
                  type: "object",
                  additionalProperties: { type: "integer" },
                  example: {
                    waiting: 0,
                    active: 3,
                    completed: 120,
                    failed: 0,
                    delayed: 0,
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Liveness check",
        responses: {
          "200": res("OK", {
            type: "object",
            properties: { status: { type: "string", example: "ok" } },
          }),
        },
      },
    },
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register an organization (client)",
        description:
          "Creates the organization with a unique generated `orgId` and sets HttpOnly authentication cookies.",
        requestBody: { required: true, content: json(ref("RegisterRequest")) },
        responses: {
          "201": res("Created", ref("AuthSession")),
          ...errors(400, 409),
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in",
        requestBody: { required: true, content: json(ref("LoginRequest")) },
        responses: {
          "200": res("OK", ref("AuthSession")),
          ...errors(400, 401),
        },
      },
    },
    "/api/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh the access token",
        description:
          "Uses the HttpOnly refresh cookie and sets a new access cookie.",
        responses: {
          "200": res("OK", {
            type: "object",
            properties: {
              accessTokenExpiresIn: { type: "number", example: 900000 },
            },
          }),
          ...errors(401),
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Log out",
        responses: { "204": { description: "Authentication cookies cleared" } },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current organization",
        security: secured,
        responses: {
          "200": res("OK", {
            type: "object",
            properties: { organization: ref("Organization") },
          }),
          ...errors(401),
        },
      },
    },
    "/api/campaigns": {
      post: {
        tags: ["Campaigns"],
        summary: "Create a campaign",
        security: secured,
        description:
          "Stores the campaign and one PENDING message per recipient, enqueues processing and returns **202** immediately. With `scheduledAt` the work is delayed until then.",
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            required: false,
            schema: { type: "string" },
            description:
              "Repeating the request with the same key returns the first campaign (HTTP 200, duplicate=true) instead of creating another.",
          },
        ],
        requestBody: {
          required: true,
          content: json(ref("CreateCampaignRequest")),
        },
        responses: {
          "202": res("Accepted", {
            type: "object",
            properties: {
              campaign: ref("Campaign"),
              jobId: { type: "string" },
              duplicate: { type: "boolean", example: false },
            },
          }),
          "200": res("Duplicate Idempotency-Key: existing campaign returned", {
            type: "object",
            properties: {
              campaign: ref("Campaign"),
              duplicate: { type: "boolean", example: true },
            },
          }),
          ...errors(400, 401, 403, 409),
        },
      },
      get: {
        tags: ["Campaigns"],
        summary: "List your campaigns",
        security: secured,
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
          { name: "status", in: "query", schema: ref("CampaignStatus") },
          {
            name: "search",
            in: "query",
            schema: { type: "string" },
            description: "Case-insensitive name contains.",
          },
          {
            name: "from",
            in: "query",
            schema: { type: "string", format: "date-time" },
            description: "Created at or after.",
          },
          {
            name: "to",
            in: "query",
            schema: { type: "string", format: "date-time" },
            description: "Created at or before.",
          },
        ],
        responses: {
          "200": res("OK", {
            type: "object",
            properties: {
              data: { type: "array", items: ref("Campaign") },
              meta: ref("Page"),
            },
          }),
          ...errors(400, 401),
        },
      },
    },
    "/api/campaigns/{id}": {
      get: {
        tags: ["Campaigns"],
        summary: "Campaign details with progress",
        security: secured,
        parameters: [idParam],
        responses: {
          "200": res("OK", ref("CampaignDetails")),
          ...errors(401, 404),
        },
      },
    },
    "/api/campaigns/{id}/start": {
      ...campaignAction(
        "Start a campaign",
        "PENDING -> QUEUED and enqueue. Calling it again is safe (`alreadyStarted: true`). A scheduled campaign is promoted to run now.",
        "202",
        {
          type: "object",
          properties: {
            campaign: ref("Campaign"),
            jobId: { type: "string" },
            alreadyStarted: { type: "boolean" },
          },
        },
      ),
    },
    "/api/campaigns/{id}/pause": {
      ...campaignAction(
        "Pause a campaign",
        "Only this campaign stops dispatching; in-flight messages finish. Unsent messages stay PENDING.",
        "200",
        campaignWrap,
      ),
    },
    "/api/campaigns/{id}/resume": {
      ...campaignAction(
        "Resume a paused campaign",
        "Re-enqueues the messages that are still PENDING.",
        "200",
        campaignWrap,
      ),
    },
    "/api/campaigns/{id}/cancel": {
      ...campaignAction(
        "Cancel a campaign",
        "Terminal. Remaining messages are not sent.",
        "200",
        campaignWrap,
      ),
    },
    "/api/campaigns/{id}/progress": {
      get: {
        tags: ["Campaigns"],
        summary: "Message counts and percent complete",
        security: secured,
        parameters: [idParam],
        responses: { "200": res("OK", ref("Progress")), ...errors(401, 404) },
      },
    },
    "/api/campaigns/{id}/messages": {
      get: {
        tags: ["Campaigns"],
        summary: "Messages of a campaign (paginated)",
        security: secured,
        parameters: [
          idParam,
          {
            name: "page",
            in: "query",
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
          },
          { name: "status", in: "query", schema: ref("MessageStatus") },
        ],
        responses: {
          "200": res("OK", {
            type: "object",
            properties: {
              data: { type: "array", items: ref("Message") },
              meta: ref("Page"),
            },
          }),
          ...errors(400, 401, 404),
        },
      },
    },
    "/api/messages/{id}": {
      get: {
        tags: ["Messages"],
        summary: "Message details incl. queue job view",
        security: secured,
        parameters: [idParam],
        responses: {
          "200": res("OK", ref("MessageDetails")),
          ...errors(401, 404),
        },
      },
    },
    "/api/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "Your latest notifications (max 100)",
        security: secured,
        parameters: [
          {
            name: "campaignId",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": res("OK", {
            type: "object",
            properties: { data: { type: "array", items: ref("Notification") } },
          }),
          ...errors(400, 401),
        },
      },
    },
    "/api/queues/stats": {
      get: {
        tags: ["Queues"],
        summary: "Job counts per queue (global)",
        security: secured,
        responses: { "200": res("OK", ref("QueueStats")), ...errors(401) },
      },
    },
  },
};
