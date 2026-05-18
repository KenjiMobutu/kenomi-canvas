# Prod MVP Durci — Design

## Objectif

Rendre Kenomi Canvas réellement exploitable en production Coolify avec Supabase, Ollama et n8n comme services réels. Le succès n'est pas seulement que `next build` passe : l'opérateur doit pouvoir se connecter, créer une venture, utiliser le chat IA, gérer des documents, déclencher une automation, recevoir des inscriptions waitlist et diagnostiquer l'état du système après un redémarrage de container.

## Contexte Actuel

- L'application Next.js 15 compile et les tests existants passent.
- Les migrations Supabase couvrent déjà une partie importante du schéma, de la RLS et des index.
- `/api/health` retourne seulement `ok`, donc il ne valide pas encore la prod.

- Le schéma Prisma legacy ne reflète pas entièrement les colonnes ajoutées par les migrations Supabase, notamment `ventures.user_id`. Pour la prod, Supabase direct reste le chemin principal du studio ; Prisma doit être limité aux vues legacy ou réaligné.

## Périmètre MVP Prod

Le MVP prod inclut uniquement les flux nécessaires pour utiliser le studio en solo :

- Auth studio via Supabase + whitelist `ALLOWED_EMAIL`.
- Dashboard admin via mot de passe + token HMAC.
- Ventures CRUD complet et persistant.
- Chat IA avec historique persistant et streaming Ollama.
- Documents avec upload Storage, métadonnées DB, signed download et suppression.
- Automations avec webhook n8n, déclenchement manuel et historique de run.
- Waitlist publique par slug de venture.
- Healthcheck production lisible par Coolify et par l'opérateur.
- Garde-fous sécurité minimum : RLS, `user_id`, validation entrées, rate limiting sur routes sensibles.

Hors périmètre MVP :

- Paiements Stripe réels.
- Agents autonomes multi-step.
- Analytics avancées.
- Multi-utilisateur.
- Workflow CI/CD complet autre que build/test/check local.

## Architecture Cible

### Données

Supabase est la source de vérité pour le studio. Les accès client utilisent le client anon + RLS. Les routes serveur utilisent `requireAllowedUser()` pour vérifier la session et l'email autorisé avant tout accès sensible.

Les tables prioritaires sont :

- `ventures`
- `conversations`
- `messages`
- `documents`
- `api_keys`
- `automation_workflows`
- nouvelle table `automation_runs`
- `waitlist`
- `user_settings`

Chaque table studio privée doit avoir une colonne `user_id`, une policy RLS propriétaire, et les requêtes serveur/client doivent aussi filtrer par `user_id` quand c'est possible.

### Fichiers Et Storage

Le bucket Supabase `documents` doit être privé. Les chemins suivent le format :

```text
<user_id>/<timestamp>_<safe_filename>
```

Les téléchargements passent par une signed URL courte. Les uploads acceptent seulement des types explicitement autorisés et une taille maximum définie côté code.

### Services Externes

Ollama est configuré dans `user_settings.ollama_base_url` et doit être accessible depuis le container Coolify. n8n est appelé uniquement via des URLs validées par `isAllowedWebhookUrl`.

La prod doit éviter les valeurs codées en dur spécifiques au réseau local, sauf comme placeholder visible dans les settings.

## Healthcheck Prod

`/api/health` doit retourner du JSON structuré :

```json
{
  "ok": true,
  "checks": {
    "env": "ok",
    "supabase": "ok",
    "database": "ok",
    "storage": "ok"
  }
}
```

Le healthcheck public ne doit jamais révéler de secrets. En cas d'erreur, il retourne `503` avec le nom du check en échec et un message court.

Checks minimum :

- variables env requises présentes ;
- connexion Supabase possible ;
- requête DB légère possible ;
- bucket `documents` présent ou Storage accessible.

Ollama et n8n sont des checks opérateur optionnels dans `/studio/settings` ou une route protégée, pas des prérequis du healthcheck Coolify.

## Flux Fonctionnels

### Ventures

L'utilisateur peut créer, modifier, archiver/supprimer et consulter ses ventures. Le slug est unique, stable et utilisé par la page waitlist publique. Toute création assigne `user_id = user.id`.

### Chat

Le flux attendu est :

1. créer ou sélectionner une conversation ;
2. envoyer un message ;
3. vérifier que la conversation appartient à l'utilisateur ;
4. charger l'historique filtré par conversation et utilisateur ;
5. appeler Ollama en streaming ;
6. sauvegarder le message utilisateur et la réponse assistant ;
7. mettre à jour la conversation avec `user_id` dans le filtre final.

Les erreurs Ollama doivent être visibles dans l'UI sans casser l'historique.

### Documents

Le flux attendu est :

1. choisir un fichier ;
2. valider taille, MIME et nom ;
3. uploader vers Storage privé ;
4. insérer les métadonnées DB ;
5. télécharger via signed URL ;
6. supprimer Storage puis DB, avec message d'erreur si une étape échoue.

### Automations

Une automation possède au minimum un nom, une URL webhook, un statut, un compteur et une date de dernier run. Chaque trigger crée une ligne `automation_runs` avec status, code HTTP, durée, message d'erreur éventuel et timestamp.

### Waitlist

La page publique `[slug]` charge la venture publique par slug et insère un email dans `waitlist`. Elle doit gérer doublon, email invalide, slug inconnu et rate limit.

## Sécurité

Avant déploiement public :

- retirer toute vraie clé de `.env.example` ;
- régénérer toute clé Supabase exposée ;
- vérifier que `.env.local` et `.env.kenomi` ne sont pas commités ;
- ajouter rate limiting sur dashboard login, waitlist, chat et automation trigger ;
- garder `SUPABASE_SERVICE_ROLE_KEY` strictement serveur ;
- filtrer les mutations critiques par `user_id` même après vérification RLS ;
- conserver la protection SSRF existante pour Ollama et webhooks.

## UX Minimum

Chaque page prioritaire doit avoir :

- loading state ;
- empty state utile ;
- toast succès/erreur ;
- confirmation de suppression ;
- bouton désactivé pendant une mutation ;
- message clair quand le service externe est indisponible.

## Tests Et Vérification

La définition de terminé pour le MVP prod :

- `npm test` passe ;
- `npx tsc --noEmit` passe ;
- `npm run build` passe ;
- healthcheck retourne JSON correct ;
- parcours manuel prod ou local prod-like :
  - login studio ;
  - créer venture ;
  - envoyer message chat ;
  - uploader/télécharger/supprimer document ;
  - créer et trigger automation ;
  - soumettre une waitlist publique ;
  - redémarrer le container et retrouver les données.

Tests à ajouter en priorité :

- unit tests validation upload ;
- API tests waitlist ;
- API tests chat ownership ;
- API tests automation trigger ;
- tests dashboard token/login ;
- tests healthcheck env manquant.

## Plan De Livraison

### Phase 1 — Prod Readiness

Nettoyer `.env.example`, documenter les variables prod, durcir `/api/health`, ajouter une checklist Coolify/Supabase et vérifier le bucket `documents`.

### Phase 2 — Sécurité Et Données

Aligner les requêtes `user_id`, ajouter rate limiting, créer `automation_runs`, vérifier RLS et corriger les écarts Prisma/Supabase qui affectent les flux réels.

### Phase 3 — Flux Essentiels

Finaliser Ventures, Chat, Documents, Automations et Waitlist avec états UI complets et erreurs visibles.

### Phase 4 — Vérification Prod

Ajouter tests prioritaires, faire un build Docker/Coolify, exécuter le parcours manuel, corriger les derniers blocages et consigner la procédure de rollback.

## Décisions

- La cible est mono-utilisateur en prod.
- Coolify est la cible de déploiement.
- Supabase direct est le chemin principal pour les données studio.
- Prisma reste legacy jusqu'à réalignement explicite.
- Ollama et n8n sont configurés comme services externes, pas embarqués dans le container Next.js.
