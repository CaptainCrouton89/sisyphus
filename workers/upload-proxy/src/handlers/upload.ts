import type { Env, TokenRecord, SessionManifest } from '../schemas';
import { validateManifest } from '../schemas';
import { jsonErr } from './health';

export async function handleUpload(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  token: TokenRecord,
): Promise<Response> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonErr(400, 'invalid multipart body');
  }

  const manifestField = form.get('manifest') as unknown;
  const bundleField = form.get('bundle') as unknown;

  if (!(manifestField instanceof File)) return jsonErr(400, 'manifest missing or wrong type');
  if (!(bundleField instanceof File)) return jsonErr(400, 'bundle missing or wrong type');
  if (bundleField.size > 100 * 1024 * 1024) return jsonErr(413, 'bundle too large');

  let manifest: unknown;
  try {
    manifest = JSON.parse(await manifestField.text());
  } catch {
    return jsonErr(400, 'manifest is not valid JSON');
  }

  if (!validateManifest(manifest)) return jsonErr(400, 'manifest schema invalid');

  const stored: SessionManifest = { ...manifest, userId: token.userId };
  const { userId, sessionId } = stored;
  const zipKey = `users/${userId}/${sessionId}.zip`;
  const jsonKey = `users/${userId}/${sessionId}.json`;

  try {
    await Promise.all([
      env.BUCKET.put(zipKey, await bundleField.arrayBuffer(), {
        httpMetadata: { contentType: 'application/zip' },
        customMetadata: { userId, sessionId, sisyphusVersion: stored.sisyphusVersion },
      }),
      env.BUCKET.put(jsonKey, JSON.stringify(stored, null, 2), {
        httpMetadata: { contentType: 'application/json' },
      }),
    ]);
  } catch (err) {
    console.error(JSON.stringify({ event: 'r2_write_fail', userId, sessionId, err: String(err) }));
    return jsonErr(502, 'r2 write failed');
  }

  ctx.waitUntil(
    env.TOKENS.put(
      `token:${token.tokenHash}`,
      JSON.stringify({
        ...token,
        lastSeenAt: new Date().toISOString(),
        sessionsUploaded: (token.sessionsUploaded ?? 0) + 1,
      }),
    ),
  );

  console.log(JSON.stringify({ event: 'upload', userId, sessionId, zipSize: bundleField.size }));

  return Response.json({
    storageKey: zipKey,
    userId,
    uploadedAt: new Date().toISOString(),
  });
}
