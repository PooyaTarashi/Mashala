"use client";

import { type FormEvent, useCallback, useState } from "react";

import type { MashalaSpec } from "../src/spec";
import type { TargetBackendRequest } from "../src/target-backend-request";
import { MashalaChat } from "./mashala-chat";

interface AiWalletClientProps {
  readonly application: MashalaSpec;
  readonly backendBaseUrl: string;
}

interface TokenResponse {
  readonly access: string;
}

function isTokenResponse(value: unknown): value is TokenResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "access") === "string" &&
    Reflect.get(value, "access") !== ""
  );
}

export function AiWalletClient({
  application,
  backendBaseUrl,
}: AiWalletClientProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState<string>();
  const [loginError, setLoginError] = useState<string>();
  const [loginPending, setLoginPending] = useState(false);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginPending(true);
    setLoginError(undefined);

    try {
      const response = await fetch(
        new URL("/api/v1/users/token/", backendBaseUrl),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        },
      );

      const payload: unknown = await response.json();

      if (!response.ok || !isTokenResponse(payload)) {
        setLoginError("The username or password was not accepted.");
        return;
      }

      setAccessToken(payload.access);
      setPassword("");
    } catch {
      setLoginError("The banking backend could not be reached.");
    } finally {
      setLoginPending(false);
    }
  };

  const authenticatedRequest = useCallback<TargetBackendRequest>(
    async (input, init) => {
      if (accessToken === undefined) {
        throw new Error("The user is not authenticated.");
      }

      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${accessToken}`);

      return fetch(input, { ...init, headers });
    },
    [accessToken],
  );

  if (accessToken === undefined) {
    return (
      <main>
        <h1>Sign in to AI Wallet</h1>
        <form onSubmit={login}>
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={loginPending}>
            {loginPending ? "Signing in..." : "Sign in"}
          </button>
          {loginError === undefined ? null : <p role="alert">{loginError}</p>}
        </form>
      </main>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setAccessToken(undefined)}>
        Sign out
      </button>
      <MashalaChat
        application={application}
        targetBackendBaseUrl={backendBaseUrl}
        targetBackendRequest={authenticatedRequest}
      />
    </>
  );
}
