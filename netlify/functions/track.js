// Fonction Netlify : interroge l'API officielle SoundCloud avec la clé secrète (jamais exposée au navigateur).
// mode=info : métadonnées du morceau. mode=link : lien de téléchargement signé, uniquement si le titulaire l'autorise.
const HOSTS = new Set(['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com']);
class UserError extends Error { constructor(m, s = 400) { super(m); this.status = s; } }
const json = (status, body) => ({ statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

function validate(raw) {
  let u;
  if (typeof raw !== 'string' || raw.length > 300) throw new UserError('Lien invalide.');
  try { u = new URL(raw.trim()); } catch { throw new UserError("Ce texte n'est pas une URL valide."); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) throw new UserError('Le lien doit être un https://soundcloud.com/… simple.');
  if (!HOSTS.has(u.hostname.toLowerCase())) throw new UserError('Seuls les liens soundcloud.com sont acceptés.');
  if (u.pathname.length < 2) throw new UserError('Ce lien ne pointe vers aucun morceau.');
  return u.toString();
}

let cached = { token: null, exp: 0 };
async function getToken() {
  const { SC_CLIENT_ID: id, SC_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) throw new UserError('Serveur non configuré : SC_CLIENT_ID et SC_CLIENT_SECRET manquent dans Netlify.', 503);
  if (cached.token && Date.now() < cached.exp) return cached.token;
  const r = await fetch('https://secure.soundcloud.com/oauth/token', {
    method: 'POST', signal: AbortSignal.timeout(10000), body: 'grant_type=client_credentials',
    headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
  });
  if (!r.ok) throw new UserError('Authentification SoundCloud refusée : vérifie les identifiants API.', 502);
  const j = await r.json();
  cached = { token: j.access_token, exp: Date.now() + Math.max(60, (j.expires_in || 3600) - 60) * 1000 };
  return cached.token;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') throw new UserError('Méthode non autorisée.', 405);
    const q = event.queryStringParameters || {};
    if (!['info', 'link'].includes(q.mode)) throw new UserError('Mode inconnu.');
    const url = validate(q.url), tk = await getToken();
    const r = await fetch('https://api.soundcloud.com/resolve?url=' + encodeURIComponent(url), { headers: { Authorization: `OAuth ${tk}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (r.status === 404) throw new UserError('Morceau introuvable ou privé.', 404);
    if (r.status === 401 || r.status === 403) throw new UserError('Accès refusé par SoundCloud pour ce morceau.', 403);
    if (!r.ok) throw new UserError(`Erreur de l'API SoundCloud (${r.status}).`, 502);
    const t = await r.json();
    if (t.kind !== 'track') throw new UserError("Ce lien n'est pas un morceau (playlists non gérées).");
    const downloadable = t.downloadable === true && typeof t.download_url === 'string';
    if (q.mode === 'info') return json(200, { title: t.title, artist: t.user?.username || '', durationMs: t.duration, artwork: (t.artwork_url || '').replace('-large', '-t300x300'), downloadable });
    if (!downloadable) throw new UserError("Le titulaire n'a pas activé le téléchargement pour ce morceau.", 403);
    if (new URL(t.download_url).hostname !== 'api.soundcloud.com') throw new UserError('Source de téléchargement non reconnue.', 502);
    // On récupère seulement l'URL de redirection signée : le navigateur télécharge ensuite directement, sans limite de taille de fonction.
    const d = await fetch(t.download_url, { headers: { Authorization: `OAuth ${tk}` }, redirect: 'manual', signal: AbortSignal.timeout(10000) });
    const loc = d.headers.get('location');
    if (d.status < 300 || d.status >= 400 || !loc) throw new UserError("SoundCloud n'a pas fourni de lien de téléchargement.", 502);
    if (new URL(loc).protocol !== 'https:') throw new UserError('Lien non sécurisé refusé.', 502);
    return json(200, { location: loc });
  } catch (e) {
    if (!(e instanceof UserError)) console.error(e);
    return json(e instanceof UserError ? e.status : 500, { error: e instanceof UserError ? e.message : 'Erreur interne du serveur.' });
  }
};
