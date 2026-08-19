import http from "node:http";

const fixtureOrigin =
  process.env.MASHALA_E2E_FIXTURE_ORIGIN ?? "http://127.0.0.1:3101";
const nextOrigin =
  process.env.MASHALA_E2E_NEXT_ORIGIN ?? "http://127.0.0.1:3100";
const fixtureUrl = new URL(fixtureOrigin);
const nextUrl = new URL(nextOrigin);
const targetSessionCookie = "mashala_target_session=fixture-target-session";
const targetResponseDelayMs = 250;

let responseSequence = 0;
let runtimeRequests = [];
let targetReads = [];
let targetWrites = [];
let productListMode = "default";

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

function routedReadEvents(requestEvent, capabilityId, values) {
  return [
    responseEvent(requestEvent, "capability.route.result", {
      outcome: "matched",
      capabilityId,
    }),
    ...(values === undefined
      ? []
      : [
          responseEvent(requestEvent, "form.values.proposed", {
            capabilityId,
            values,
          }),
        ]),
  ];
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

  if (text === "What is my account balance?") {
    return routedReadEvents(requestEvent, "account_balance");
  }

  if (text === "Show me a product") {
    return routedReadEvents(requestEvent, "show_product");
  }

  if (text === "fixture: malformed product") {
    return routedReadEvents(requestEvent, "show_product", {
      productId: "malformed",
    });
  }

  if (text === "fixture: product network failure") {
    return routedReadEvents(requestEvent, "show_product", {
      productId: "network-failure",
    });
  }

  if (text === "Show me the products") {
    return routedReadEvents(requestEvent, "list_products");
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

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function targetReadRecord(request, path) {
  return {
    url: `${fixtureOrigin}${path}`,
    handledBy: "fixture-target-backend",
    method: request.method,
    headers: { ...request.headers },
    body: null,
  };
}

function hasTargetSession(request) {
  return request.headers.cookie?.includes(targetSessionCookie) === true;
}

async function handleAccountBalance(request, response) {
  if (request.method !== "GET") {
    json(response, 405, { error: "Method not allowed" });
    return;
  }

  targetReads.push(targetReadRecord(request, "/account/balance"));
  await wait(targetResponseDelayMs);

  if (!hasTargetSession(request)) {
    json(response, 401, { error: "fixture authorization required" });
    return;
  }

  json(response, 200, {
    balance: 1250.5,
    status: "Available",
    account_number: "•••• 0042",
    internal_note: "balance-response-private-sentinel",
  });
}

function productResponse(productId) {
  return {
    id: productId,
    title: productId === "SKU / 100" ? "Field Notebook" : "Desk Notebook",
    description: "A durable notebook made for everyday notes.",
    price: 24.5,
    image_url: "/product-images/notebook.svg",
    supplier_note: "single-product-private-sentinel",
  };
}

async function handleSingleProduct(request, response, encodedProductId) {
  if (request.method !== "GET") {
    json(response, 405, { error: "Method not allowed" });
    return;
  }

  const path = `/products/${encodedProductId}`;
  targetReads.push(targetReadRecord(request, path));
  await wait(targetResponseDelayMs);

  if (!hasTargetSession(request)) {
    json(response, 401, { error: "fixture authorization required" });
    return;
  }

  let productId;
  try {
    productId = decodeURIComponent(encodedProductId);
  } catch {
    json(response, 400, { error: "invalid product identifier" });
    return;
  }

  if (productId === "network-failure") {
    request.socket.destroy();
    return;
  }

  if (productId === "malformed") {
    json(response, 200, {
      title: "Malformed fixture product",
      description: "The declared price property is intentionally absent.",
      image_url: "/product-images/notebook.svg",
      internal_note: "malformed-response-private-sentinel",
    });
    return;
  }

  json(response, 200, productResponse(productId));
}

async function handleProductList(request, response) {
  if (request.method !== "GET") {
    json(response, 405, { error: "Method not allowed" });
    return;
  }

  targetReads.push(targetReadRecord(request, "/products"));
  await wait(targetResponseDelayMs);

  if (!hasTargetSession(request)) {
    json(response, 401, { error: "fixture authorization required" });
    return;
  }

  if (productListMode === "empty") {
    json(response, 200, []);
    return;
  }

  json(response, 200, [
    {
      ...productResponse("SKU-100"),
      title: "Field Notebook",
      warehouse_note: "product-list-private-sentinel-one",
    },
    {
      ...productResponse("SKU-200"),
      title: "Mechanical Pencil",
      description: "A balanced pencil with a refillable 0.5 mm mechanism.",
      price: 8.75,
      image_url: "/product-images/pencil.svg",
      warehouse_note: "product-list-private-sentinel-two",
    },
  ]);
}

function handleProductImage(response, product) {
  const color = product === "pencil.svg" ? "#d27d2d" : "#355c7d";
  const label = product === "pencil.svg" ? "Pencil" : "Notebook";
  response.writeHead(200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" role="img"><rect width="320" height="180" fill="${color}"/><text x="160" y="98" text-anchor="middle" fill="white" font-family="sans-serif" font-size="28">${label}</text></svg>`,
  );
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
    targetReads = [];
    targetWrites = [];
    productListMode =
      requestUrl.searchParams.get("productList") === "empty"
        ? "empty"
        : "default";
    json(response, 200, { reset: true });
    return;
  }

  if (requestUrl.pathname === "/__e2e/state") {
    json(response, 200, {
      fixtureOrigin,
      nextOrigin,
      productListMode,
      runtimeRequests,
      targetReads,
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

  if (requestUrl.pathname === "/account/balance") {
    void handleAccountBalance(request, response);
    return;
  }

  if (requestUrl.pathname === "/products") {
    void handleProductList(request, response);
    return;
  }

  if (requestUrl.pathname.startsWith("/products/")) {
    void handleSingleProduct(
      request,
      response,
      requestUrl.pathname.slice("/products/".length),
    );
    return;
  }

  if (requestUrl.pathname.startsWith("/product-images/")) {
    handleProductImage(
      response,
      requestUrl.pathname.slice("/product-images/".length),
    );
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
