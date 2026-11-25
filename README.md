# Radioscribe

[Ouvrir l’atelier](https://sbtchr.github.io/Radioscribe/)

Radioscribe accompagne des groupes de deux à quatre élèves dans l’écriture d’une chronique, de l’amorce à l’annonce du morceau suivant. Les élèves écrivent ou dictent eux-mêmes. Le résultat est un script A4 pour le studio.

## En classe

1. Sur un premier ordinateur, choisir **Créer une chronique**, donner un titre et entrer les prénoms. L’introduction s’ouvre.
2. Cliquer sur le code en haut pour le copier. Sur les autres ordinateurs, choisir **Rejoindre une chronique**, entrer le code puis choisir son prénom. Sur un ordinateur partagé, chaque nouvelle réplique peut être attribuée à n’importe quel membre.
3. Cliquer sur un prénom, écrire ou dicter, puis corriger. Le menu **…** de la réplique permet notamment de la diviser au curseur, de la fusionner avec la suivante, de la déplacer et de changer de voix. Le bouton **SOS rédaction** propose des amorces à insérer. À défaut de réplique active, le clic copie l’amorce.
4. Valider l’introduction et choisir les angles de la première partie. À la fin d’une partie, en ajouter une autre ou ouvrir la conclusion. La barre de structure permet de revenir sur une section validée.
5. Ouvrir **Relire le script**. Faire la checklist, vérifier la dernière annonce musicale et répéter dans le téléprompteur. Dans **Préparer l’impression**, choisir le script commun, le script d’une personne ou toutes les versions personnalisées. Choisir ensuite l’imprimante ou **Enregistrer au format PDF** dans la fenêtre du navigateur. Désactiver ses en-têtes et pieds de page s’il ajoute l’URL.

Le code donne accès au texte et à sa modification. Il se partage dans le groupe. **Sur cet appareil** désigne un projet local au navigateur. Son code ne donne pas accès depuis un autre ordinateur. Les projets locaux et les brouillons en attente dépendent des données de site de ce navigateur.

## Dictée et essai sur les MacBook

À l’entrée dans l’atelier, un worker prépare **Whisper Large v3 Turbo**. Il télécharge depuis Hugging Face les poids ONNX épinglés dans `src/models.js`. Prévoir un premier chargement volumineux (plus d’un Go pour Turbo). La progression indique des octets par fichier. Le navigateur peut réutiliser son cache selon l’espace disponible. Le clavier est disponible pendant le téléchargement.

Turbo utilise WebGPU, un encodeur FP16 et un décodeur Q4. Dans les réglages de dictée on peut choisir explicitement **Small** ou **Base**, multilingues et quantifiés Q8, sur CPU/WASM. Le microphone est ouvert uniquement après **Enregistrer**. Les échantillons mono à 16 kHz transitent entre l’AudioWorklet et le worker local. Après **Arrêter et transcrire**, écouter n’est pas nécessaire : le texte proposé peut être accepté ou annulé. Seul le texte accepté rejoint le script. Les pistes micro sont fermées à l’arrêt, à l’annulation ou à la sortie. Aucune API de reconnaissance distante ni télémétrie audio.

Pour évaluer les machines de l’école :

1. Noter le modèle du Mac, sa mémoire, la version de Chrome et le réseau utilisé. Créer un projet fictif sur cet appareil dans un profil Chrome de test.
2. Relever le temps de chargement affiché dans **Réglages**, puis fermer et rouvrir le projet après un rechargement de la page. Relever le second temps. Utiliser un nouveau profil de test pour répéter la mesure à froid.
3. Faire lire par deux personnes des passages connus de 10 à 30 secondes, avec des noms propres. Relever le temps de parole et la « dernière transcription » dans les réglages. Comparer les mots au texte de référence avant toute correction. Refaire l’essai avec le bruit normal de la salle.
4. Enchaîner dix prises. Observer la mémoire dans le gestionnaire des tâches de Chrome et vérifier que le clavier répond pendant le calcul. Refaire un premier téléchargement simultané sur plusieurs Mac. Tester Small séparément si nécessaire.

## Lancer une copie sur son ordinateur

Installer Node.js 24 ou ultérieur. Télécharger le dépôt (bouton **Code → Download ZIP**), le décompresser, ouvrir le Terminal dans le dossier, puis exécuter :

```sh
npm ci --ignore-scripts
npm run dev
```

Ouvrir l’adresse affichée, généralement http://localhost:5173. Garder le Terminal ouvert. Sans configuration Supabase, les projets fonctionnent sur cet appareil. Pour servir le résultat compilé, utiliser `npm run build` puis `npm run preview`. En dehors de localhost, HTTPS est requis pour le microphone et les fonctions sécurisées du navigateur.

## Relier une installation à Supabase

1. Ouvrir le projet Supabase **dédié** à l’installation. Dans **Authentication → Sign In / Providers**, activer **Allow anonymous sign-ins**, puis enregistrer. Aucune adresse e-mail n’est demandée aux élèves.
2. Pour une installation neuve, ouvrir **SQL Editor**, copier et exécuter une seule fois les fichiers de `supabase/migrations`, par ordre de nom. Sur le projet Radioscribe de SbTchR, la migration initiale a déjà été installée.
3. Dans **Connect** ou **Settings → API Keys**, copier l’URL du projet et la clé publique `sb_publishable_…`. Dupliquer `.env.example` en `.env.local`, renseigner les deux lignes puis redémarrer le serveur. Une clé secrète ou `service_role` ne doit jamais entrer dans le site.
4. Ouvrir deux profils de navigateur indépendants et rejoindre la même chronique avec son code. Ajouter une réplique de chaque côté. Vérifier ensuite le comportement après une interruption réseau.

Le client combine les notifications Realtime, une vérification périodique de rattrapage et une file locale. Une suite de changements sur plusieurs blocs est appliquée dans une seule transaction. Chaque ligne a une révision et chaque opération un identifiant de rejeu. En cas de conflit, **Comparer et récupérer mes modifications** conserve la proposition locale et la version du groupe. Les contenus sont stockés dans un schéma privé. La seule table publiée dans Realtime contient le numéro de version du projet, avec RLS. Les quatre fonctions RPC autorisent la création, l’adhésion par code, la lecture et l’écriture. Les essais de code sont limités à 24 par session en dix minutes. Les limites Supabase de création de sessions anonymes s’ajoutent à cette limite.

L’offre de l’organisation a été cotée à 0 $ par mois à la création. Les quotas de stockage, d’authentification et de Realtime, ainsi que les conditions de mise en pause pour inactivité, dépendent du plan. Vérifier **Usage** dans Supabase avant une utilisation à grande échelle. [Offres Supabase](https://supabase.com/pricing)

## Déployer sur GitHub Pages

Le dépôt contient un workflow **Publier Radioscribe**. Dans **Settings → Pages → Source**, choisir **GitHub Actions**. Un envoi sur `main` lance les tests de base de données et la compilation, puis publie `dist`. L’URL et la clé publiable du projet de cette installation figurent dans le workflow. Pour une autre installation, définir les variables de dépôt `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` dans **Settings → Secrets and variables → Actions → Variables**, puis relancer le workflow. Les liens d’invitation utilisent un fragment, compatible avec le sous-dossier GitHub Pages. Les poids Whisper sont hébergés par Hugging Face.

## Vérifications

- `npm test` vérifie le modèle de données et exécute la migration sur un moteur PostgreSQL temporaire PGlite. Les tests utilisent plusieurs identités, contrôlent RLS, les tentatives de code, le rejeu, la conservation du texte et le refus des opérations périmées.
- `npm run build && npm run test:e2e` utilise Chrome installé sur le Mac et des données fictives. Les scénarios couvrent le parcours court, le parcours long, le SOS au curseur, les déplacements de partie, le téléphone, la reprise, le téléprompteur et les PDF. En CI installer Chromium avec `npx playwright install --with-deps chromium`. Les PDF de recette sont générés dans `test-results`.
- Sur le Mac de développement, Chrome a exécuté **le vrai modèle Turbo** sur deux voix françaises de synthèse, avec deux extraits de **12,72 s** et **12,04 s**. Premier chargement **34,67 s**, second chargement dans le même profil **31,06 s**. Temps de transcription **4,08 s** et **2,71 s**, puis **3,27 s** et **2,75 s**. Turbo a restitué les mots et les noms propres des deux textes de référence. Base a notamment mal transcrit « Lausanne » et « Martigny ». Ces chiffres concernent ces deux échantillons et cet ordinateur. Le bruit de classe, les voix d’élèves, la stabilité mémoire prolongée et la charge simultanée du réseau de l’école restent à mesurer.

## Repères dans le code

L’interface est écrite en React et construite avec Vite. Les opérations communes sont dans `src/domain.js`, la synchronisation dans `src/store.js`, les banques pédagogiques dans `src/atelier.json`, et l’impression et le téléprompteur dans `src/output.jsx`. Les polices sont servies par le site. Les licences des polices distribuées sont jointes dans `public/licences`.

Documentation technique : [Transformers.js](https://huggingface.co/docs/transformers.js/en/pipelines), [poids Turbo](https://huggingface.co/onnx-community/whisper-large-v3-turbo), [sessions anonymes Supabase](https://supabase.com/docs/guides/auth/auth-anonymous), [Realtime](https://supabase.com/docs/guides/realtime/postgres-changes), [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
