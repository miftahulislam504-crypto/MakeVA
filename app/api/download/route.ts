export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OWNER = /^[A-Za-z0-9-]{1,39}$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * Asks GitHub for a short-lived signed URL of a release asset and returns it.
 * The video itself never passes through this server. The token is used for
 * this single request and is neither logged nor stored.
 */
export async function POST(req: Request) {
  let data: { token?: unknown; owner?: unknown; repo?: unknown; assetId?: unknown };
  try {
    data = await req.json();
  } catch {
    return reply({ error: 'Invalid request.' }, 400);
  }

  const { token, owner, repo, assetId } = data;
  if (
    typeof token !== 'string' ||
    token.length < 10 ||
    typeof owner !== 'string' ||
    !OWNER.test(owner) ||
    typeof repo !== 'string' ||
    !REPO.test(repo) ||
    typeof assetId !== 'number' ||
    !Number.isInteger(assetId) ||
    assetId <= 0
  ) {
    return reply({ error: 'Invalid request.' }, 400);
  }

  let res: Response;
  try {
    res = await fetch(
      'https://api.github.com/repos/' +
        owner +
        '/' +
        repo +
        '/releases/assets/' +
        assetId,
      {
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/octet-stream',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'remotion-cloud',
        },
        redirect: 'manual',
        cache: 'no-store',
      },
    );
  } catch {
    return reply({ error: 'Could not reach GitHub.' }, 502);
  }

  const location = res.headers.get('location');
  if (res.status >= 300 && res.status < 400 && location) {
    return reply({ url: location });
  }
  if (res.status === 401) return reply({ error: 'The token is invalid or has expired.' }, 401);
  if (res.status === 404) return reply({ error: 'The video no longer exists.' }, 404);
  return reply({ error: 'GitHub could not provide the file.' }, 502);
}
