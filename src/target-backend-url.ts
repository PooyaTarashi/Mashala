export function targetBackendBaseUrl(value: string | URL): URL {
  let baseUrl: URL;

  try {
    baseUrl = new URL(value.toString());
  } catch {
    throw new TypeError(
      "Invalid target backend base URL: expected an absolute HTTP(S) URL.",
    );
  }

  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new TypeError(
      "Invalid target backend base URL: expected an absolute HTTP(S) URL.",
    );
  }

  if (baseUrl.username !== "" || baseUrl.password !== "") {
    throw new TypeError(
      "Invalid target backend base URL: embedded credentials are not allowed.",
    );
  }

  return baseUrl;
}

export function resolveTargetBackendUrl(
  baseUrlInput: string | URL,
  path: string,
  invalidPathMessage: string,
): URL {
  const baseUrl = targetBackendBaseUrl(baseUrlInput);
  const resolvedUrl = new URL(path, baseUrl);

  if (resolvedUrl.origin !== baseUrl.origin) {
    throw new TypeError(invalidPathMessage);
  }

  return resolvedUrl;
}
