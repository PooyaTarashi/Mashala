import { assembledMashalaApplication } from "../../../src/server/assembled-application";
import { createRuntimeHttpPostHandler } from "../../../src/server/http-runtime-transport";

export const runtime = "nodejs";

export const POST = createRuntimeHttpPostHandler({
  applicationRuntime: assembledMashalaApplication,
});
