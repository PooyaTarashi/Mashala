#!/usr/bin/env node

import { runMashalaCli } from "../src/cli/rag-build.ts";

process.exitCode = await runMashalaCli(process.argv.slice(2));
