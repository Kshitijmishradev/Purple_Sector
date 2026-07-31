// Single source of truth for backend URLs.
// Nothing else in the app should hardcode a host.
export const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export const WS_URL =
  import.meta.env.VITE_WS_URL ?? API_URL.replace(/^http/, "ws");

export const RACES_URL = `${API_URL}/races`;
