import axios from "axios";

const configuredApiUrl = import.meta.env.DEV
  ? (import.meta.env.VITE_API_DEV_URL || "http://127.0.0.1:3000")
  : (import.meta.env.VITE_API_URL || "");
const withoutTrailingSlash = configuredApiUrl.endsWith("/")
  ? configuredApiUrl.slice(0, -1)
  : configuredApiUrl;
const API_BASE = withoutTrailingSlash.endsWith("/api")
  ? withoutTrailingSlash.slice(0, -4)
  : withoutTrailingSlash;

export const TOKEN_KEY = "factoryflow_token";

const apiClient = axios.create({
  baseURL: API_BASE + "/api",
  headers: { "Content-Type": "application/json" },
});

// Add the saved login token to each request without changing where it is stored.
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = "Bearer " + token;
  return config;
});

// Keep the existing api(path, options) shape so Login and Setup keep working.
export async function api(path, options = {}) {
  const normalizedPath = path.startsWith("/") ? path : "/" + path;
  let body = options.data;

  if (options.body) {
    try {
      body = JSON.parse(options.body);
    } catch {
      body = options.body;
    }
  }

  try {
    const response = await apiClient.request({
      url: normalizedPath,
      method: options.method || "GET",
      data: body,
    });
    return response.data;
  } catch (requestError) {
    if (requestError.response) {
      throw new Error(requestError.response.data?.error || "Something went wrong");
    }
    throw new Error("Failed to fetch");
  }
}
