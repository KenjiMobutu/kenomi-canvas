# Agent Architecture

## Pipeline

1. Scout — découverte d'opportunité micro-SaaS
2. Validation — scoring et analyse de marché
3. Builder — spécification technique MVP
4. Payment — stratégie de monétisation
5. Marketing — plan de distribution et brouillons publiables
6. Decision — synthèse et décision go/no-go

## Exécution

Les agents peuvent être lancés manuellement depuis le Studio. Les schedules autonomes sont représentés par `agent_schedules`, et les travaux récurrents/longs par `autonomy_jobs`.

Les gates d'approbation humaine restent obligatoires pour les actions risquées :

- `create_checkout`
- `deploy`
- `publish_campaign`
- `scale_budget`

## Orchestration Status

`POST /api/studio/agents/orchestrate` évalue les schedules actifs et classe les agents en trois états :

- `due` : schedules arrivés à échéance.
- `executable` : schedules dus sans approbation humaine requise.
- `blocked` : schedules dus mais gardés derrière un gate humain.

Pour les schedules exécutables, la route met à jour `last_run_at`, calcule `next_run_at` depuis `interval_minutes`, puis journalise `agent.orchestration.evaluated` dans `agent_events`.

Le Studio affiche ces compteurs dans l'écran Agents afin de rendre l'autonomie observable sans masquer les décisions qui restent humaines. Les onglets `Autonomy Ops` exposent aussi jobs, actions et approvals avec durée, provider, model, retry count et dernière erreur quand ces données existent.

## Unlock séquentiel

Un agent est débloqué uniquement si la sortie de l'étape précédente est présente dans `venture_pipeline`. Scout est toujours débloqué.

## Chaque run enregistre

- agent_id et model utilisé
- duration_ms
- fallback_triggered (Claude si Ollama indisponible)
- Événement d'audit dans `agent_events`

## Runbooks

- Incident autonomie : `docs/runbooks/autonomy-incident.md`
- Webhook Stripe : `docs/runbooks/stripe-webhook.md`
- Déploiement Coolify : `docs/runbooks/coolify-deploy.md`
- Console Hermes Telegram : `docs/runbooks/telegram-hermes-operator.md`

## Hermes Remote Console

Hermes peut aussi être utilisé comme console opérateur distante via Telegram.

- canal unique V1 : Telegram
- identité unique : `Hermes`
- lectures distantes : `brief`, `revenue`, `alerts`, `approvals`, `prospects`
- actions low-risk autorisées : `run prospect`, `run devops`, `scan followups`
- toute commande distante est auditée dans `operator_remote_commands`

Telegram ne remplace pas le Studio. Il agit comme surface de commande et de notification distante au-dessus des mêmes garde-fous Hermes.
