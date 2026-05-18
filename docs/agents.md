# Agent Architecture

## Pipeline

1. Scout — découverte d'opportunité micro-SaaS
2. Validation — scoring et analyse de marché
3. Builder — spécification technique MVP
4. Payment — stratégie de monétisation
5. Marketing — plan de distribution
6. Decision — synthèse et décision go/no-go

## Exécution

Les agents peuvent être lancés manuellement depuis le Studio. Les schedules autonomes sont représentés par `agent_schedules`, mais les gates d'approbation humaine restent obligatoires pour les actions risquées (payment, decision).

## Unlock séquentiel

Un agent est débloqué uniquement si la sortie de l'étape précédente est présente dans `venture_pipeline`. Scout est toujours débloqué.

## Chaque run enregistre

- agent_id et model utilisé
- duration_ms
- fallback_triggered (Claude si Ollama indisponible)
- Événement d'audit dans `agent_events`
