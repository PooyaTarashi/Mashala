import {
  expect,
  test,
  type APIRequestContext,
  type Page,
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
  readonly runtimeRequests: readonly FixtureRequestRecord[];
  readonly targetWrites: readonly FixtureRequestRecord[];
}

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

async function expectNoTargetWrite(
  request: APIRequestContext,
): Promise<void> {
  expect((await fixtureState(request)).targetWrites).toHaveLength(0);
}

test.beforeEach(async ({ context, request }) => {
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
});

test("runs the full editable, confirmed browser-direct transaction", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Mashala Bank Demo" }),
  ).toBeVisible();

  await sendMessage(page, "Transfer 500 to the fixture recipient");

  await expect(page.getByLabel("Matched capability")).toContainText(
    "transfer_money",
  );
  await expect(page.getByLabel("Proposed form values")).toContainText(
    "2 suggested values",
  );
  await expect(
    page.getByRole("textbox", { name: /^Recipient/ }),
  ).toHaveValue(
    "Suggested recipient",
  );
  await expect(page.getByRole("spinbutton", { name: /^Amount/ })).toHaveValue(
    "500",
  );

  await page
    .getByRole("textbox", { name: /^Recipient/ })
    .fill("Reviewed recipient");
  await page
    .getByRole("combobox", { name: /^Transfer speed/ })
    .selectOption("standard");
  await page.getByRole("button", { name: "Review request" }).click();

  await expect(page.getByTestId("workflow-state")).toContainText("CONFIRMING");
  const review = page.getByRole("region", { name: "Review and confirm" });
  await expect(review).toContainText('"Reviewed recipient"');
  await expectNoTargetWrite(request);

  // Even a second low-level form submission cannot skip required confirmation.
  await page.locator("#capability-transfer_money").evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
  });
  await expect(page.getByTestId("workflow-state")).toContainText("CONFIRMING");
  await expectNoTargetWrite(request);

  await page.getByRole("button", { name: "Confirm and send" }).click();
  await expect(
    page.getByText("The target backend accepted the request."),
  ).toBeVisible();
  await expect(page.getByTestId("workflow-state")).toContainText("COMPLETED");

  const state = await fixtureState(request);
  expect(state.runtimeRequests).toHaveLength(1);
  expect(state.targetWrites).toHaveLength(1);
  const runtimeRequest = state.runtimeRequests[0];
  const targetWrite = state.targetWrites[0];
  expect(runtimeRequest).toBeDefined();
  expect(targetWrite).toBeDefined();

  expect(runtimeRequest?.url).toBe(`${fixtureOrigin}/api/runtime`);
  expect(runtimeRequest?.headers.cookie).toBeUndefined();
  expect(runtimeRequest?.headers.authorization).toBeUndefined();
  expect(JSON.stringify(runtimeRequest?.body)).not.toContain(targetCookieValue);
  expect(JSON.stringify(runtimeRequest?.body)).not.toMatch(
    /credential|authorization|token|operation/iu,
  );

  expect(targetWrite?.url).toBe(`${fixtureOrigin}/transfers`);
  expect(targetWrite?.url).not.toBe(`${nextOrigin}/transfers`);
  expect(targetWrite?.handledBy).toBe("fixture-target-backend");
  expect(targetWrite?.headers.cookie).toContain(
    `${targetCookieName}=${targetCookieValue}`,
  );
  expect(targetWrite?.body).toEqual({
    recipient: "Reviewed recipient",
    amount: 500,
    speed: "standard",
    saveRecipient: false,
  });
});

test("cancelling required confirmation creates no target-backend write", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await sendMessage(page, "Transfer 500 then cancel");
  await expect(
    page.getByRole("textbox", { name: /^Recipient/ }),
  ).toHaveValue(
    "Suggested recipient",
  );
  await page
    .getByRole("combobox", { name: /^Transfer speed/ })
    .selectOption("standard");
  await page.getByRole("button", { name: "Review request" }).click();
  await expect(page.getByTestId("workflow-state")).toContainText("CONFIRMING");

  await page.getByRole("button", { name: "Back to form" }).click();
  await expect(page.getByTestId("workflow-state")).toContainText("FILLING");
  await expectNoTargetWrite(request);

  await page.getByRole("button", { name: "Cancel current request" }).click();
  await expect(page.getByTestId("workflow-state")).toContainText("IDLE");
  await expectNoTargetWrite(request);
});

for (const scenario of [
  {
    name: "invalid",
    message: "fixture: invalid proposal",
  },
  {
    name: "undeclared",
    message: "fixture: undeclared proposal",
  },
] as const) {
  test(`${scenario.name} proposed values cannot reach execution`, async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await sendMessage(page, scenario.message);

    await expect(page.getByLabel("Protocol error")).toContainText(
      "Suggested values were rejected",
    );
    await expect(
      page.getByRole("textbox", { name: /^Recipient/ }),
    ).toHaveValue("");
    await expect(
      page.getByRole("spinbutton", { name: /^Amount/ }),
    ).toHaveValue("");
    await expect(
      page.getByRole("button", { name: "Confirm and send" }),
    ).toHaveCount(0);
    await expectNoTargetWrite(request);
  });
}

test("a documentation question never enters target-backend execution", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await sendMessage(page, "How do transfers work?");

  await expect(page.getByLabel("Assistant message")).toContainText(
    "require explicit confirmation",
  );
  await expect(page.getByTestId("workflow-state")).toContainText("IDLE");
  await expect(page.getByText("Complete the request")).toHaveCount(0);
  await expectNoTargetWrite(request);

  const state = await fixtureState(request);
  expect(state.runtimeRequests).toHaveLength(1);
  expect(state.runtimeRequests[0]?.headers.cookie).toBeUndefined();
  expect(JSON.stringify(state.runtimeRequests[0]?.body)).not.toContain(
    targetCookieValue,
  );
});
