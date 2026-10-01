# Libellés de la page Production commune — 1 octobre 2026

Refs #230, #223. Livraison partielle.

L'introduction ne décrit plus trois vues séparées : elle explique la page commune et ses réglages avancés. Le nom accessible de la barre de mix et des régions de clips/réglages utilise les clés production.common.*, disponibles en FR et EN.

Supprimés : les deux helpers inutilisés productionViewLabel/productionViewIntro, le type ProductionView et la liste PRODUCTION_VIEWS du fichier shared.ts ; 11 clés FR obsolètes workspace.production.* : intro, nav, mix, clips, tools, mix.intro, clips.intro, tools.intro, clips.scroll, clips.timeline, tools.scroll. Les deux clés workspace.production et workspace.production.title sont conservées. Le modèle de préférences de densité utilise encore des identifiants historiques de vue et reste conservé.

Vérification : aucune référence aux 11 anciennes clés dans les sources produit, TypeScript et compilation réussis ; 14 tests i18n et 14 tests de comportement réussis. La garde de parité production.* FR/EN couvre les nouvelles clés ; une garde vérifie que les anciennes clés ne réapparaissent pas. Aucun calcul audio modifié.

Les autres libellés hors production.common.* ne sont pas déclarés entièrement traduits. Les preuves complètes, mutations et critères de #230 restent ouverts.
