# ProjetsCleaner

Scanne un projet, repere les dossiers `node_modules` / environnements virtuels et :
- les ajoute dans `.gitignore`, **ou**
- les supprime du disque.

Le CLI affiche un spinner et une barre de progression avec pourcentage, temps ecoule et ETA.

## Installation
```bash
npm install -g projetscleaner
# ou depuis le repo (local)
npm install
```

## Utilisation
```bash
projetscleaner
```
1. Saisis le chemin du projet a nettoyer (le `.gitignore` dans ce dossier sera mis a jour si tu choisis le mode 1).
2. Choisis le mode :
   - `1` : ajoute chaque dossier cible dans `.gitignore`
   - `2` : supprime physiquement les dossiers trouves

## Développement
- Executer en local sans installation globale :
  ```bash
  npm run cli
  ```
- Pack à blanc :
  ```bash
  npm pack --dry-run
  ```

## Licence
MIT
