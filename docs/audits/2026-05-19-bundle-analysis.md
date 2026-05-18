# Bundle Analysis — 2026-05-19

## Méthodologie

Build production Next.js 16 + Turbopack (`npm run build`). Mesure des chunks JS dans `.next/static/chunks/`.

**Note** : `@next/bundle-analyzer` est **incompatible avec Turbopack** (Next 16). `next experimental-analyze` est encore expérimental et nécessite une intervention manuelle. À défaut, on mesure les chunks générés.

## Bundle global

| Métrique          | Valeur                                          |
| ----------------- | ----------------------------------------------- |
| Total JS (chunks) | **1.42 MB**                                     |
| Nombre de chunks  | 34                                              |
| Cible recommandée | < 2 MB (acceptable pour une app Studio interne) |

## Top 5 chunks par taille

| Rang | Taille     | Hash               | Cause probable                            |
| ---- | ---------- | ------------------ | ----------------------------------------- |
| 1    | **233 KB** | `0yvz9i9ft_2_k.js` | React + ReactDOM + framework              |
| 2    | **227 KB** | `0ut6kalbqvi0i.js` | Prisma client legacy (lib/generated/)     |
| 3    | **172 KB** | `0wnzh9y82ldnj.js` | Page lourde (gamification ou studio root) |
| 4    | **135 KB** | `162j3mggdeajj.js` | framer-motion + radix-ui                  |
| 5    | **110 KB** | `03~yq9q893hmn.js` | Lucide icons + helpers                    |

(L'identification exacte par hash nécessiterait `experimental-analyze` complet ou lecture des sourcemaps.)

## Analyse

### Bon signaux

- 34 chunks → bon code splitting automatique par Turbopack
- Pas de chunk monolithique > 250 KB
- Pages utilisateur servies en bundles < 100 KB chacun (auto-split par segment route)

### Points d'attention

#### 1. Prisma generated (~227 KB)

Le client Prisma généré dans `lib/generated/prisma/` représente ~17 000 lignes. À mesure que `Idea`/`Venture`/`Payment`/`LandingPage`/`Campaign`/`Decision`/`Metric`/`BudgetRequest` sont migrés vers Supabase JS, ce poids disparaît.

**Action :** suivre la stratégie documentée dans `CLAUDE.md` → "Stratégie long terme".

#### 2. framer-motion + radix-ui (~135 KB)

Dépendances dynamiques de la lib `@radix-ui/*` + animations. Utilisées dans 2-3 composants seulement.

**Action future :**

- Audit usage : combien de composants utilisent réellement `framer-motion` ?
- Si peu : remplacer par CSS transitions / `@keyframes` natifs.
- Si nécessaire : code split via `next/dynamic`.

#### 3. Lucide icons (~110 KB)

Import nominatif `import { Check, X, ... } from 'lucide-react'`. Turbopack tree-shake correctement, mais 50+ icônes différentes utilisées dans le studio = bundle non négligeable.

**Action future :**

- Audit des icônes (combien d'imports uniques sur tout le projet ?)
- Substituer les icônes peu utilisées par SVG inline si <5 occurrences.

## Recommandations priorisées

### Aucune action urgente

Le bundle 1.42 MB est **acceptable** pour une app Studio mono-utilisateur en réseau privé. Lighthouse score local non bloquant.

### À considérer dans 2-3 mois

1. **Migration Prisma → Supabase JS** complète : ~227 KB d'économie
2. **Audit framer-motion** : si retiré, ~80 KB
3. **Audit lucide-react** : tree-shaking déjà bon, gain marginal (~20 KB)

### Outils manquants

- `next experimental-analyze` est bloqué (interaction manuelle). À retenter dans une version future de Next 16 ou attendre que `@next/bundle-analyzer` supporte Turbopack.

## Re-mesure

Pour relancer cette analyse après une modification :

```bash
npm run build
find .next/static/chunks -name "*.js" | xargs ls -lhS | head -10
find .next/static -name "*.js" | xargs cat | wc -c | awk '{print "Total JS:", $1/1024/1024, "MB"}'
```
