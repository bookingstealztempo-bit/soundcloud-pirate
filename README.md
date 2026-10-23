# Soundcloud Pirate — version Netlify

Lien SoundCloud → téléchargement/conversion MP3 320 kb/s ou WAV, **uniquement pour les morceaux dont le titulaire autorise le téléchargement** (API officielle).

## Déploiement
1. Crée une application SoundCloud (https://soundcloud.com/you/apps) pour obtenir `client_id` / `client_secret`.
2. Mets ce dossier dans un dépôt Git et importe-le sur Netlify (ou `npx netlify deploy --prod`). **Le glisser-déposer (Netlify Drop) ne déploie pas les fonctions.**
3. Netlify → Site settings → Environment variables : ajoute `SC_CLIENT_ID` et `SC_CLIENT_SECRET`, puis redéploie.

## Fonctionnement
- `netlify/functions/track.js` garde la clé secrète côté serveur et renvoie les infos du morceau, puis un lien signé si le téléchargement est autorisé.
- Le navigateur télécharge directement depuis le CDN (pas de limite de taille de fonction) et convertit localement (lamejs / WAV).

## Limites
- Si le CDN de SoundCloud bloque la lecture par le navigateur (CORS), « Récupérer le fichier » échoue : utilise « Télécharger l'original », puis dépose le fichier dans la page.
- Pas de tags ID3 dans le MP3. Pas de limitation de débit côté fonction.
- L'intégration à l'API SoundCloud n'a pas été testée avec de vrais identifiants.
