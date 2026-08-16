import http from "node:http";

const fixtureOrigin =
  process.env.MASHALA_E2E_FIXTURE_ORIGIN ?? "http://127.0.0.1:3101";
const nextOrigin =
  process.env.MASHALA_E2E_NEXT_ORIGIN ?? "http://127.0.0.1:3100";
const fixtureUrl = new URL(fixtureOrigin);
const nextUrl = new URL(nextOrigin);
const targetSessionCookie = "mashala_target_session=fixture-target-session";

let responseSequence = 0;
let runtimeRequests = [];
let targetWrites = [];

function json(response, status, value, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) {
      throw new Error("Fixture request body is too large.");
    }
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function responseEvent(requestEvent, type, payload) {
  responseSequence += 1;
  return {
    protocolVersion: "0.1",
    eventId: `fixture_server_${String(responseSequence)}`,
    conversationId: requestEvent.conversationId,
    inReplyTo: requestEvent.eventId,
    type,
    payload,
  };
}

function runtimeEvents(requestEvent) {
  const text = requestEvent.payload?.text;

  if (text === "How do transfers work?") {
    return [
      responseEvent(requestEvent, "assistant.message", {
        text: "Transfers use an editable form and require explicit confirmation.",
      }),
    ];
  }

  const route = responseEvent(requestEvent, "capability.route.result", {
    outcome: "matched",
    capabilityId: "transfer_money",
  });
  let values;

  if (text === "fixture: invalid proposal") {
    values = {
      recipient: "Invalid recipient",
      amount: -5,
      speed: "standard",
    };
  } else if (text === "fixture: undeclared proposal") {
    values = {
      recipient: "Undeclared recipient",
      amount: 25,
      speed: "standard",
      undeclaredField: "must-not-pass",
    };
  } else {
    values = {
      recipient: "Suggested recipient",
      amount: 500,
    };
  }

  return [
    route,
    responseEvent(requestEvent, "form.values.proposed", {
      capabilityId: "transfer_money",
      values,
    }),
  ];
}

async function handleRuntime(request, response) {
  if (request.method !== "POST") {
    json(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJson(request);
    runtimeRequests.push({
      url: `${fixtureOrigin}/api/runtime`,
      method: request.method,
      headers: { ...request.headers },
      body,
    });

    json(response, 200, { events: runtimeEvents(body.event) });
  } catch {
    json(response, 400, { error: "Invalid fixture runtime request" });
  }
}

async function handleTransfer(request, response) {
  if (request.method !== "POST") {
    json(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJson(request);
    const write = {
      url: `${fixtureOrigin}/transfers`,
      handledBy: "fixture-target-backend",
      method: request.method,
      headers: { ...request.headers },
      body,
    };
    targetWrites.push(write);

    if (!request.headers.cookie?.includes(targetSessionCookie)) {
      json(response, 401, { accepted: false });
      return;
    }

    json(response, 201, { accepted: true });
  } catch {
    json(response, 400, { accepted: false });
  }
}

function proxyToNext(request, response) {
  const upstreamHeaders = { ...request.headers };
  delete upstreamHeaders.cookie;

  const upstream = http.request(
    {
      protocol: nextUrl.protocol,
      hostname: nextUrl.hostname,
      port: nextUrl.port,
      method: request.method,
      path: request.url,
      headers: upstreamHeaders,
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        upstreamResponse.headers,
      );
      upstreamResponse.pipe(response);
    },
  );

  upstream.on("error", () => {
    if (!response.headersSent) {
      json(response, 502, { error: "Next.js fixture upstream is unavailable" });
    } else {
      response.end();
    }
  });
  request.pipe(upstream);
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", fixtureOrigin);

  if (requestUrl.pathname === "/__e2e/health") {
    json(response, 200, { ready: true });
    return;
  }

  if (requestUrl.pathname === "/__e2e/reset" && request.method === "POST") {
    responseSequence = 0;
    runtimeRequests = [];
    targetWrites = [];
    json(response, 200, { reset: true });
    return;
  }

  if (requestUrl.pathname === "/__e2e/state") {
    json(response, 200, {
      fixtureOrigin,
      nextOrigin,
      runtimeRequests,
      targetWrites,
    });
    return;
  }

  if (requestUrl.pathname === "/api/runtime") {
    void handleRuntime(request, response);
    return;
  }

  if (requestUrl.pathname === "/transfers") {
    void handleTransfer(request, response);
    return;
  }

  proxyToNext(request, response);
});

server.listen(Number(fixtureUrl.port), fixtureUrl.hostname);

function stop() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
