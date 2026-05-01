export function handleHealth(): Response {
  return Response.json({ ok: true });
}

export function jsonErr(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}
