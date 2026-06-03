export interface BffSessionResponse<TSession> {
  session: TSession | null;
}

export function buildBffSessionResponse<TSession>(
  session: TSession | null,
): BffSessionResponse<TSession> {
  return { session };
}

export function jsonBffSessionResponse<TSession>(session: TSession | null): Response {
  return Response.json(buildBffSessionResponse(session));
}
