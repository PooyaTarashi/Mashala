import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Request,
} from "@playwright/test";

const fixtureOrigin = "http://127.0.0.1:3101";
const nextOrigin = "http://127.0.0.1:3100";
const targetCookieName = "mashala_target_session";
const targetCookieValue = "fixture-target-session";

interface FixtureRequestRecord {
  readonly url: string;
  readonly handledBy?: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

interface FixtureState {
  readonly fixtureOrigin: string;
  readonly nextOrigin: string;
  readonly productListMode: "default" | "empty";
  readonly runtimeRequests: readonly FixtureRequestRecord[];
  readonly targetReads: readonly FixtureRequestRecord[];
  readonly targetWrites: readonly FixtureRequestRecord[];
}

const unexpectedNetworkByPage = new WeakMap<Page, string[]>();

async function fixtureState(request: APIRequestContext): Promise<FixtureState> {
  const response = await request.get("/__e2e/state");
  expect(response.ok()).toBe(true);
  return (await response.json()) as FixtureState;
}

async function sendMessage(page: Page, text: string): Promise<void> {
  await page.waitForFunction(() => {
    const input = document.querySelector("#mashala-message");
    return (
      input !== null &&
      Object.keys(input).some((key) => key.startsWith("__reactProps$"))
    );
  });
  await page.getByLabel("Message").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

function waitForBrowserRead(page: Page, pathname: string): Promise<Request> {
  return page.waitForRequest((candidate) => {
    const url = new URL(candidate.url());
    return (
      candidate.method() === "GET" &&
      url.origin === fixtureOrigin &&
      url.pathname === pathname
    );
  });
}

function expectRuntimePrivacy(
  state: FixtureState,
  forbiddenResponseValues: readonly string[],
): void {
  expect(state.runtimeRequests).toHaveLength(1);
  for (const runtimeRequest of state.runtimeRequests) {
    expect(runtimeRequest.url).toBe(`${fixtureOrigin}/api/runtime`);
    expect(runtimeRequest.method).toBe("POST");
    expect(runtimeRequest.headers.cookie).toBeUndefined();
    expect(runtimeRequest.headers.authorization).toBeUndefined();

    const serialized = JSON.stringify(runtimeRequest.body);
    expect(serialized).not.toContain(targetCookieValue);
    expect(serialized).not.toContain('"method":"GET"');
    expect(serialized).not.toContain("/account/balance");
    expect(serialized).not.toContain("/products/");
    for (const value of forbiddenResponseValues) {
      expect(serialized).not.toContain(value);
    }
    expect(runtimeRequest.body).toMatchObject({
      event: { type: "user.message" },
    });
  }
}

function expectDirectBrowserRead(
  page: Page,
  browserRequest: Request,
  state: FixtureState,
  expectedUrl: string,
  authenticated = true,
  targetHandled = true,
): void {
  expect(browserRequest.url()).toBe(expectedUrl);
  expect(browserRequest.resourceType()).toBe("fetch");
  expect(browserRequest.frame()).toBe(page.mainFrame());

  expect(state.targetReads).toHaveLength(targetHandled ? 1 : 0);
  if (!targetHandled) {
    expect(state.runtimeRequests.every(({ method }) => method === "POST")).toBe(
      true,
    );
    return;
  }
  const targetRead = state.targetReads[0];
  expect(targetRead).toBeDefined();
  expect(targetRead?.url).toBe(expectedUrl);
  expect(targetRead?.url).not.toContain(nextOrigin);
  expect(targetRead?.handledBy).toBe("fixture-target-backend");
  expect(targetRead?.method).toBe("GET");
  expect(targetRead?.body).toBeNull();
  if (authenticated) {
    expect(targetRead?.headers.cookie).toContain(
      `${targetCookieName}=${targetCookieValue}`,
    );
  } else {
    expect(targetRead?.headers.cookie).toBeUndefined();
  }

  expect(state.runtimeRequests.every(({ method }) => method === "POST")).toBe(
    true,
  );
}

test.beforeEach(async ({ context, page, request }) => {
  const reset = await request.post("/__e2e/reset");
  expect(reset.ok()).toBe(true);
  await context.addCookies([
    {
      name: targetCookieName,
      value: targetCookieValue,
      url: fixtureOrigin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  const unexpectedNetwork: string[] = [];
  unexpectedNetworkByPage.set(page, unexpectedNetwork);
  page.on("request", (browserRequest) => {
    if (new URL(browserRequest.url()).origin !== fixtureOrigin) {
      unexpectedNetwork.push(browserRequest.url());
    }
  });
});

test.afterEach(async ({ page }) => {
  expect(unexpectedNetworkByPage.get(page)).toEqual([]);
});

test("routes an authenticated balance read directly to the fixture backend", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const browserReadPromise = waitForBrowserRead(page, "/account/balance");

  await sendMessage(page, "What is my account balance?");
  await expect(
    page.getByRole("status", { name: "Loading read result" }),
  ).toBeVisible();
  const browserRead = await browserReadPromise;

  await expect(page.getByLabel("Matched capability")).toContainText(
    "account_balance",
  );
  const result = page.getByRole("article", { name: "Read result" });
  await expect(result.getByRole("heading", { name: "Account balance" })).toBeVisible();
  await expect(result).toContainText("$1,250.50");
  await expect(result).toContainText("Available");
  await expect(result).toContainText("•••• 0042");
  await expect(result).not.toContainText("balance-response-private-sentinel");
  await expect(page.getByTestId("workflow-state")).toContainText("PRESENTING");

  const state = await fixtureState(request);
  expectDirectBrowserRead(
    page,
    browserRead,
    state,
    `${fixtureOrigin}/account/balance`,
  );
  expectRuntimePrivacy(state, [
    "balance-response-private-sentinel",
    "1250.5",
    "•••• 0042",
  ]);
});

test("collects a missing product identifier before a direct validated GET", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await sendMessage(page, "Show me a product");

  await expect(page.getByLabel("Matched capability")).toContainText(
    "show_product",
  );
  await expect(page.getByTestId("workflow-state")).toContainText("COLLECTING");
  const productId = page.getByRole("textbox", { name: /^Product ID/ });
  await expect(productId).toHaveValue("");
  expect((await fixtureState(request)).targetReads).toHaveLength(0);

  const expectedPath = "/products/SKU%20%2F%20100";
  const browserReadPromise = waitForBrowserRead(page, expectedPath);
  await productId.fill("SKU / 100");
  await page.getByRole("button", { name: "Fetch result" }).click();
  await expect(
    page.getByRole("status", { name: "Loading read result" }),
  ).toBeVisible();
  const browserRead = await browserReadPromise;

  const result = page.getByRole("article", { name: "Read result" });
  await expect(result.getByRole("heading", { name: "Field Notebook" })).toBeVisible();
  await expect(result).toContainText(
    "A durable notebook made for everyday notes.",
  );
  await expect(result).toContainText("$24.50");
  await expect(result.getByRole("img", { name: "Product photograph" })).toHaveAttribute(
    "src",
    `${fixtureOrigin}/product-images/notebook.svg`,
  );
  await expect(result).not.toContainText("single-product-private-sentinel");

  const state = await fixtureState(request);
  expectDirectBrowserRead(
    page,
    browserRead,
    state,
    `${fixtureOrigin}${expectedPath}`,
  );
  expectRuntimePrivacy(state, [
    "single-product-private-sentinel",
    "Field Notebook",
    "24.5",
  ]);
});

test("renders a direct product-list GET as deterministic cards", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const browserReadPromise = waitForBrowserRead(page, "/products");

  await sendMessage(page, "Show me the products");
  await expect(
    page.getByRole("status", { name: "Loading read result" }),
  ).toBeVisible();
  const browserRead = await browserReadPromise;

  await expect(page.getByLabel("Matched capability")).toContainText(
    "list_products",
  );
  const list = page.getByRole("list", { name: "Read results" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list.getByRole("heading", { name: "Field Notebook" })).toBeVisible();
  await expect(list.getByRole("heading", { name: "Mechanical Pencil" })).toBeVisible();
  await expect(list).not.toContainText("product-list-private-sentinel");

  const state = await fixtureState(request);
  expectDirectBrowserRead(
    page,
    browserRead,
    state,
    `${fixtureOrigin}/products`,
  );
  expectRuntimePrivacy(state, [
    "product-list-private-sentinel-one",
    "product-list-private-sentinel-two",
    "Mechanical Pencil",
    "8.75",
  ]);
});

test("renders the declared empty state for an empty product list", async ({
  page,
  request,
}) => {
  const reset = await request.post("/__e2e/reset?productList=empty");
  expect(reset.ok()).toBe(true);
  await page.goto("/");
  const browserReadPromise = waitForBrowserRead(page, "/products");

  await sendMessage(page, "Show me the products");
  const browserRead = await browserReadPromise;
  const empty = page.getByRole("status", { name: "Empty read result" });
  await expect(empty).toContainText("No products are currently available.");
  await expect(page.getByTestId("workflow-state")).toContainText("EMPTY");
  await expect(page.getByRole("list", { name: "Read results" })).toHaveCount(0);

  const state = await fixtureState(request);
  expect(state.productListMode).toBe("empty");
  expectDirectBrowserRead(
    page,
    browserRead,
    state,
    `${fixtureOrigin}/products`,
  );
  expectRuntimePrivacy(state, []);
});

test("fails the complete product card when the result is malformed", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const browserReadPromise = waitForBrowserRead(page, "/products/malformed");

  await sendMessage(page, "fixture: malformed product");
  await expect(page.getByRole("textbox", { name: /^Product ID/ })).toHaveValue(
    "malformed",
  );
  await page.getByRole("button", { name: "Fetch result" }).click();
  const browserRead = await browserReadPromise;
  const failure = page.getByRole("alert", { name: "Read failure" });
  await expect(failure).toContainText(
    "does not match the declared result view",
  );
  await expect(page.getByText("Malformed fixture product")).toHaveCount(0);
  await expect(page.getByTestId("workflow-state")).toContainText("FAILED");

  const state = await fixtureState(request);
  expectDirectBrowserRead(
    page,
    browserRead,
    state,
    `${fixtureOrigin}/products/malformed`,
  );
  expectRuntimePrivacy(state, [
    "malformed-response-private-sentinel",
    "Malformed fixture product",
  ]);
});

test("keeps target authorization authoritative for the balance GET", async ({
  context,
  page,
  request,
}) => {
  await context.clearCookies();
  await page.goto("/");
  const browserReadPromise = waitForBrowserRead(page, "/account/balance");

  await sendMessage(page, "What is my account balance?");
  const browserRead = await browserReadPromise;
  const failure = page.getByRole("alert", { name: "Read failure" });
  await expect(failure).toContainText("HTTP 401");
  await expect(page.getByTestId("workflow-state")).toContainText("FAILED");

  const state = await fixtureState(request);
  expectDirectBrowserRead(
    page,
    browserRead,
    state,
    `${fixtureOrigin}/account/balance`,
    false,
  );
  expectRuntimePrivacy(state, ["fixture authorization required"]);
});

test("shows a sanitized failure when the local target request is aborted", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.route(
    `${fixtureOrigin}/products/network-failure`,
    (route) => route.abort("connectionrefused"),
  );
  const browserReadPromise = waitForBrowserRead(
    page,
    "/products/network-failure",
  );

  await sendMessage(page, "fixture: product network failure");
  await expect(page.getByRole("textbox", { name: /^Product ID/ })).toHaveValue(
    "network-failure",
  );
  await page.getByRole("button", { name: "Fetch result" }).click();
  const browserRead = await browserReadPromise;
  const failure = page.getByRole("alert", { name: "Read failure" });
  await expect(failure).toContainText("could not be reached");
  await expect(failure).not.toContainText("socket");
  await expect(page.getByTestId("workflow-state")).toContainText("FAILED");

  const state = await fixtureState(request);
  expectDirectBrowserRead(
    page,
    browserRead,
    state,
    `${fixtureOrigin}/products/network-failure`,
    true,
    false,
  );
  expectRuntimePrivacy(state, []);
});
