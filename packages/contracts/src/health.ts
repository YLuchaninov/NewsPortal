export interface HealthResponse {
  service: string;
  status: "ok";
  timestamp: string;
  checks?: Record<string, string>;
}

export function createHealthResponse(
  service: string,
  checks?: Record<string, string>
): HealthResponse {
  return {
    service,
    status: "ok",
    timestamp: new Date().toISOString(),
    ...(checks ? { checks } : {})
  };
}
