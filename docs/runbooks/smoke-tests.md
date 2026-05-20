# Smoke Tests Runbook

## Quand l'utiliser

À chaque release majeure, après un changement de schéma Supabase, ou avant
de redémarrer l'autonomie en production. Couvre deux niveaux : HTTP non-auth
(automatisable) et browser auth (manuel, requiert une session Studio).

## 1. Smoke HTTP non-auth (automatisé)

Vérifie 7 endpoints critiques sans cookie : pages publiques 200, pages
protégées 307/401, validations 400, health 200/503.

### Prérequis

- App en cours d'exécution (`npm run dev` ou container Coolify déployé)
- Variable optionnelle : `SMOKE_BASE_URL` (défaut `http://localhost:3000`)

### Exécution

```bash
npm run smoke
# ou contre une preview Coolify
SMOKE_BASE_URL=https://lab.kenomi.eu npm run smoke
```

### Sortie attendue

```
ok login page (200)
ok dashboard login page (200)
ok studio agents protected page (307)
ok autonomy jobs protected API (401)
ok events invalid payload (400)
ok waitlist invalid payload (400)
ok health endpoint (200|503)
smoke ok <URL>
```

`health endpoint (503)` est acceptable en local si `HEALTH_DATABASE_REQUIRED`
n'est pas à `false`. En production, exiger `200`.

## 2. Smoke browser authentifié (manuel)

Vérifie que la boucle Marketing produit bien des drafts visibles dans
`/studio/marketing`, que les approbations sont actionnables et que les badges
budget breach apparaissent correctement.

### Prérequis

- Compte Studio actif (`ALLOWED_EMAIL`)
- Au moins un venture `approved` dans `venture_pipeline`
- App déployée ou `npm run dev`

### Checklist

1. **Connexion**
   - Ouvrir `https://lab.kenomi.eu/login` (ou `http://localhost:3000/login`)
   - Saisir email autorisé, cliquer "Magic link"
   - Cliquer sur le lien reçu par email → redirige vers `/studio/dashboard`

2. **Lancer un run Marketing**
   - Aller dans `/studio/agents`
   - Trouver l'agent **Marketing**, cliquer "Run"
   - Attendre fin du run (~10-30s selon Ollama vs Claude fallback)
   - Vérifier que la durée et le modèle s'affichent dans la card

3. **Vérifier les drafts générés**
   - Aller dans `/studio/marketing`
   - La bande "Campagnes générées" doit afficher :
     - Nombre de drafts > 0 (channels × messages)
     - Compteurs par statut (au moins `draft` ou `blocked`)
   - Au moins N approbations `publish_campaign` en attente

4. **Approuver une publication**
   - Cliquer "Publier" sur une approbation en attente
   - Toast vert "Campagne approuvée et publiée"
   - Le draft passe de `blocked` à `published`
   - Vérifier dans Supabase ou `/studio/analytics` qu'un événement
     `campaign_published` est inséré

5. **Rejeter une publication**
   - Cliquer "Rejeter" sur une autre approbation
   - Toast vert "Campagne rejetée"
   - Le draft passe à `rejected` (ou reste blocked + action cancelled)

6. **Vérifier le dashboard Autonomy Ops**
   - Aller dans `/studio/agents`
   - Onglet **Actions** : voir les `publish_campaign` (completed/cancelled)
   - Onglet **Approvals** : la file pending diminue
   - Onglet **Jobs** : pas de job en `failed`

7. **Vérifier l'analytics**
   - Aller dans `/studio/analytics`
   - La bande "Live KPIs" doit refléter les nouveaux événements
     (visits stagnent, spend augmente si budget > 0 sur le draft)

### Si quelque chose échoue

- Draft pas généré → vérifier `agent_runs` (modèle utilisé, durée, erreurs)
- Bouton Publier sans effet → vérifier `marketingPublisher` configuré
  (`MARKETING_ADAPTER`, `N8N_PUBLISH_WEBHOOK_URL`)
- Approval pas mise à jour → vérifier `/api/studio/autonomy/jobs` répond 200
  (et que la session cookie est valide)

## 3. Smoke combiné avant release

Workflow recommandé :

```bash
# 1. Tests locaux
npm run typecheck
npm run lint
npm test
npm run build

# 2. Smoke HTTP local
npm run dev &  # dans un terminal
sleep 3
npm run smoke

# 3. Smoke HTTP preview Coolify (après push)
SMOKE_BASE_URL=https://lab-preview.kenomi.eu npm run smoke

# 4. Smoke browser auth (manuel) sur la preview
# Suivre la checklist section 2

# 5. Promote la preview en prod
```

## 4. Smoke revenue-proof production

Ce smoke est le gate qui empeche de declarer "100% autonomie revenue-first"
tant que la boucle n'a pas de preuve live.

### Exécution

```bash
SMOKE_BASE_URL=https://lab.kenomi.eu npm run smoke:revenue-proof
```

Le script vérifie:

- `/api/health` retourne 200.
- `/api/studio/revenue/proof` ne s'ouvre pas en GET.
- `/api/studio/revenue/proof` est protégé en POST sans session.
- Supabase prod contient au moins:
  - un checkout,
  - un paiement complété,
  - un event `payment_succeeded`,
  - un event `campaign_published`,
  - un event `campaign_spend`,
  - un event `page_view`,
  - un event `waitlist_signup`,
  - une décision `scale`, `cut` ou `hold`.

Le smoke revenue-proof prouve la boucle applicative. Il ne prouve pas que
Stripe est en mode live ni qu'une campagne est sortie sur un canal public. Pour
declarer "revenu reel", verifier aussi:

- au moins un paiement Stripe live demarre depuis une landing publique;
- `MARKETING_ADAPTER=n8n`;
- un `provider_run_id` externe non mock pour au moins une campagne;
- une livraison post-paiement en statut `completed`.

### Résultat attendu avant preuve live

Avant le paiement Stripe test et les events contrôlés, ce smoke doit échouer
avec des libellés comme:

```text
not ok revenue proof incomplete: checkout_missing, completed_payment_missing
```

Cet échec est sain: il signifie que la release gate mesure la preuve réelle,
pas la présence du code.
