# Note technique : API LanguageTool

**Projet :** Alphonse, projet fil-rouge 8WEB101 (UQAC, automne 2026)
**Étape du planning :** lire la documentation de l'API LanguageTool et effectuer un premier appel de test avec `curl`
**Date des tests :** 25 septembre 2026
**Environnement de test :** iPad avec le terminal a-Shell (`curl` et `python3 -m json.tool`) pour les tests 1 à 7 ; ordinateur sous Windows avec Git Bash (`curl` et `jq`) pour les tests 7 b et 7 c

\---

## 1\. Point d'entrée et règles d'usage

* **Point d'entrée unique :** `https://api.languagetool.org/v2/check`. Aucun autre point d'entrée ne doit être utilisé.
* **Méthode :** POST uniquement. Le corps est envoyé au format `application/x-www-form-urlencoded`.

### Limites du service gratuit

|Limite|Valeur|
|-|-|
|Requêtes|20 par minute et par @ IP |
|Volume de texte par minute|75 Ko par minute et par @ IP|
|Volume de texte par requête|20 Ko|
|Suggestions orthographiques|fournies pour les 30 premiers mots mal orthographiés seulement|

### Conditions d'utilisation

* Le service ne doit pas recevoir de requêtes automatisées en continu. Alphonse doit donc déclencher l'analyse avec parcimonie : anti-rebond sur la saisie et bouton « Analyser ».
* Un lien bien visible vers https://languagetool.org, sans attribut `rel="nofollow"`, est exigé.
* L'éditeur de l'application est responsable d'informer ses utilisateurs du traitement de leurs données, puisque le texte saisi est transmis à un service tiers. Ce point rejoint la section « Loi 25 » de la fiche d'analyse.
* Le service est gratuit et n'offre aucune garantie de disponibilité ni de performance. Son comportement peut changer sans préavis ; la version observée est d'ailleurs une version de développement (SNAPSHOT).
* Les champs et paramètres absents de la documentation officielle sont internes au service et ne doivent pas être utilisés.

\---

## 2\. Paramètres utilisés

|Paramètre|Statut|Rôle dans Alphonse|
|-|-|-|
|`text`|obligatoire|Texte du message à analyser|
|`language`|obligatoire|`fr` ; une requête sans ce paramètre est rejetée (voir test 5)|
|`level`|facultatif|`picky` active des règles supplémentaires destinées aux textes formels|

Avec `curl`, `--data-urlencode` doit être préféré à `-d` pour le paramètre `text`, afin d'encoder correctement les accents, les apostrophes et les caractères spéciaux (`\&`, `+`).

\---

## 3\. Champs utiles de la réponse

Seuls des champs documentés sont retenus.

|Champ|Contenu|Usage prévu dans Alphonse|
|-|-|-|
|`matches`|Liste des défauts détectés (vide si aucun)|Base du calcul du score|
|`matches\[].message`|Explication destinée à l'utilisateur|Texte affiché dans le panneau latéral|
|`matches\[].shortMessage`|Version courte du message ; peut être une chaîne vide|Libellé court, avec repli sur `message`|
|`matches\[].offset`|Position du défaut, comptée en caractères à partir de 0|Surlignage et application des corrections|
|`matches\[].length`|Longueur du passage fautif|Surlignage et application des corrections|
|`matches\[].replacements\[].value`|Suggestions de correction, de la plus probable à la moins probable ; tableau parfois vide|Reformulation (première suggestion)|
|`matches\[].rule.id`|Identifiant de la règle déclenchée|Traçabilité, désactivation éventuelle d'une règle|
|`matches\[].rule.issueType`|Type normalisé du défaut|Classement pour le score (voir constat A)|
|`matches\[].rule.category.id`|Catégorie propre au français (`CAT\_GRAMMAIRE`, `TYPOS`, etc.)|Classement pour le score (voir constat A)|
|`language.detectedLanguage`|Langue détectée dans le texte|Contrôle de cohérence (texte bien rédigé en français)|

Plusieurs champs non documentés ont été observés dans les réponses : `type.typeName`, `sentenceRanges`, `extendedSentenceRanges`, `premiumHint`, `isPremium`, `contextForSureMatch` et `ignoreForIncompleteSentence`. Ils ne seront pas utilisés.

\---

## 4\. Résultats des tests

|N°|Texte envoyé|Paramètres|Résultat|
|-|-|-|-|
|1|`Bonjour, je vous envoi le raport demain.`|`language=fr`|2 défauts (détail ci-dessous)|
|2|`Pouvez-vous confirmer?`|`language=fr`|1 défaut : espace manquante avant le point d'interrogation (détail ci-dessous)|
|3|`Salut, envoie-moi le dossier vite!!!`|`language=fr`|Aucun défaut (`matches` vide)|
|4|Texte du test 1|`language=fr`, `level=picky`|Résultat identique au test 1 : mêmes 2 défauts, aucun défaut supplémentaire|
|5|`Test`|sans `language`|HTTP 400, corps en texte brut : `Error: Missing 'language' parameter, e.g. 'language=en-US' for American English or 'language=fr' for French`|
|6|Texte du test 3|`language=fr`, `level=picky`|Aucun défaut (`matches` vide)|
|7|`Objet: réunion de lundi`|`language=fr`|2 défauts : espace manquante avant le deux-points et faute d'orthographe signalée à tort sur « réunion » (détail ci-dessous)|
|7 b|Texte du test 7, passé en argument de `curl` sous Windows|`language=fr`|2 défauts : « réunion » toujours signalé à tort, mais avec une longueur de 7|
|7 c|Texte du test 7, lu depuis un fichier encodé en UTF-8 (`text@fichier.txt`) sous Windows|`language=fr`|1 seul défaut : espace manquante avant le deux-points ; « réunion » n'est plus signalé|

### Détail du test 1

|Passage|`offset` / `length`|`rule.id`|`issueType`|`category.id`|Première suggestion|
|-|-|-|-|-|-|
|« envoi »|17 / 5|`PRONSUJ\_NONVERBE`|`uncategorized`|`CAT\_GRAMMAIRE`|« envoie »|
|« raport »|26 / 6|`FR\_SPELLING\_RULE`|`misspelling`|`TYPOS`|« rapport » (7 suggestions au total)|

Les positions ont été vérifiées à la main : elles correspondent exactement aux mots fautifs.

### Détail du test 2

|Passage|`offset` / `length`|`rule.id`|`issueType`|`category.id`|Suggestion|
|-|-|-|-|-|-|
|« confirmer? »|12 / 10|`FRENCH\_WHITESPACE`|`uncategorized`|`MISC`|« confirmer ? »|

Deux particularités sont à noter :

* la zone signalée englobe le mot entier et le point d'interrogation, et non le seul emplacement de l'espace manquante ;
* d'après le message du service, l'espace proposée est une espace fine insécable, un caractère qui ne se distingue pas d'une espace ordinaire à l'écran.

### Détail du test 7

|Passage|`offset` / `length`|`rule.id`|`issueType`|`category.id`|Suggestions|
|-|-|-|-|-|-|
|« Objet: »|0 / 6|`FRENCH\_WHITESPACE`|`uncategorized`|`MISC`|« Objet : »|
|« réunion »|7 / 8|`FR\_SPELLING\_RULE`|`misspelling`|`TYPOS`|« réunion », « Réunion »|

\---

## 5\. Constats et conséquences pour Alphonse

### A. Le champ `issueType` ne suffit pas pour classer les défauts

Sur les trois défauts relevés au cours des tests, deux sont renvoyés avec `issueType = "uncategorized"` :

* l'erreur de grammaire du test 1, qui n'est pas marquée `grammar` ;
* l'erreur typographique du test 2, qui n'est pas marquée `typographical`.

Seule la faute d'orthographe porte un type exploitable (`misspelling`). La documentation officielle précise d'ailleurs que ce champ n'est pas défini pour toutes les langues.

Or le barème actuel du planning détecte la grammaire et la syntaxe par les valeurs `grammar` et `typographical` : aucune de ces deux erreurs n'aurait été comptée.

**Décision proposée :** classer les défauts d'abord selon `rule.category.id`, au moyen d'une table de correspondance tenue dans le code :

|`category.id` observé|Critère du barème|
|-|-|
|`TYPOS`|Orthographe|
|`CAT\_GRAMMAIRE`|Grammaire et syntaxe|
|`MISC`|Selon le signe concerné (voir constat G)|

Toute catégorie inconnue recevra une pénalité par défaut, modérée. Le champ `issueType` sert en complément ; `misspelling` reste fiable pour l'orthographe. Le barème du dossier de conception doit être mis à jour en conséquence.

### B. L'API ne juge ni le registre ni la ponctuation expressive

Le test 3 ne relève aucun défaut, alors que le message contient une formule familière (« Salut »), une ponctuation excessive (« !!! ») et aucune formule de clôture. Le test 6 confirme ce résultat avec le niveau `picky`. La couche de règles locales en JavaScript n'est donc pas seulement une solution de repli : elle est indispensable au critère « Politesse et registre » et au critère « Clarté et ton ».

### C. Les erreurs du service ne sont pas au format JSON

Le test 5 renvoie un code HTTP 400 accompagné d'un corps en texte brut. Le code d'Alphonse devra :

1. vérifier le code de statut avant de lire la réponse ;
2. lire le corps comme du texte en cas d'échec ;
3. afficher un message compréhensible ;
4. basculer sur le score calculé par les seules règles locales.

Tout code différent de 200 sera traité de la même manière, y compris un éventuel dépassement de limite. Ce cas ne sera pas provoqué volontairement, afin de respecter les conditions d'utilisation.

### D. Construction de la reformulation

* Retenir la première valeur de `replacements`, qui est la plus probable.
* Ne rien remplacer lorsque le tableau est vide.
* Appliquer les corrections de la fin vers le début du texte, par `offset` décroissant, pour que les positions restantes demeurent valides.

### E. Application du barème actuel au test 1

Les règles locales détectent la formule d'appel (« Bonjour ») et l'absence de formule de clôture.

|Critère|Pénalité avec le classement actuel (`issueType`)|Pénalité avec le classement proposé (`category.id`)|
|-|-|-|
|Orthographe (« raport »)|−6|−6|
|Grammaire (« envoi »)|0 (non détectée)|−8|
|Absence de formule de clôture (règle locale)|−10|−10|
|**Score final**|**84 : feu vert**|**76 : feu orange**|

Avec le classement actuel, un message comportant deux fautes et aucune formule de clôture obtiendrait le feu vert « Prêt à partir ». Ce résultat justifie la correction proposée au constat A.

### F. Stabilité du service

Le service étant en version de développement et susceptible d'évoluer sans préavis, `docs/exemple-reponse.json` sert de référence. Les tests 1, 3 et 5 ont déjà été rejoués une seconde fois le même jour, avec des résultats identiques. L'ensemble des tests sera rejoué avant la démonstration pour vérifier que la structure de la réponse n'a pas changé.

### G. La règle typographique suit l'usage européen, pas l'usage québécois

La règle `FRENCH\_WHITESPACE` (test 2) exige une espace fine insécable avant le point d'interrogation. Or l'Office québécois de la langue française recommande de n'insérer aucune espace avant le point-virgule, le point d'exclamation et le point d'interrogation, l'espace fine restant acceptable si l'on en dispose. La phrase du test 2 est donc correcte selon l'usage québécois.

Pénaliser ce défaut ferait baisser la note de messages conformes à la norme du Québec, où l'application est développée.

Le test 7 montre cependant que la même règle contrôle aussi l'espace insécable devant le deux-points, que l'OQLF exige. Désactiver entièrement la règle avec `disabledRules=FRENCH\_WHITESPACE` ferait donc perdre un contrôle utile.

**Décision proposée :** conserver la règle et filtrer ses résultats côté client, selon le dernier caractère du passage signalé (le texte compris entre `offset` et `offset + length`) :

|Dernier caractère du passage|Traitement|
|-|-|
|`?`, `!` ou `;`|Défaut ignoré (usage québécois)|
|`:`|Défaut conservé et pénalisé|

Cette décision reste à valider en équipe et à consigner dans le wiki du dépôt.

### H. Le niveau `picky` n'apporte rien sur les textes testés

Les tests 4 et 6 renvoient exactement les mêmes résultats que les tests 1 et 3. Le paramètre `level=picky` ne détecte ni défaut supplémentaire ni registre familier. Il ne sera pas utilisé tant qu'un test ne démontre pas son intérêt.

### I. Le texte doit être normalisé avant l'envoi

Le mot « réunion », correctement orthographié, a été signalé comme faute de frappe dans deux des trois essais :

|Test|Poste et mode d'envoi|Longueur de « réunion » selon le service|Mot signalé|
|-|-|-|-|
|7|iPad, texte passé en argument|8|Oui|
|7 b|Windows, texte passé en argument|7|Oui|
|7 c|Windows, texte lu depuis un fichier UTF-8|7|Non|

Le test 7 c montre que le service reconnaît parfaitement le mot lorsqu'il le reçoit en UTF-8, sous sa forme composée (norme Unicode NFC). Les deux échecs proviennent donc du poste qui envoie la requête, et non du service :

* **Sur l'iPad**, le « é » a été transmis sous forme décomposée (norme NFD) : une lettre « e » suivie d'un accent combinant, soit deux caractères qui s'affichent comme un seul. D'où la longueur de 8, et la suggestion d'un mot visuellement identique à celui envoyé.
* **Sous Windows**, `curl` a vraisemblablement reçu l'argument dans l'encodage propre à Windows plutôt qu'en UTF-8. Le caractère accentué est alors arrivé altéré au serveur, sans changer la longueur du mot.

Le problème propre à Windows ne concerne pas Alphonse, car un navigateur transmet toujours le texte en UTF-8. En revanche, un utilisateur peut produire la forme décomposée, par exemple en collant un texte copié depuis certains logiciels. D'où quatre conséquences :

1. normaliser le texte avant chaque envoi, en JavaScript avec `texte.normalize("NFC")` ;
2. calculer le surlignage et appliquer les corrections sur ce même texte normalisé, puisque les positions renvoyées dépendent exactement de la chaîne transmise ;
3. ajouter ce cas au jeu de tests, car une fausse faute d'orthographe coûte 6 points injustifiés au score ;
4. pour les tests en ligne de commande contenant des accents, toujours passer le texte par un fichier encodé en UTF-8 (`--data-urlencode "text@fichier.txt"`), jamais directement en argument.

\---

## Sources

* LanguageTool, *Public HTTP Proofreading API* : https://dev.languagetool.org/public-http-api
* LanguageTool, documentation JSON de l'API (Swagger) : https://languagetool.org/http-api/swagger-ui/#/default
* Office québécois de la langue française, *Espacement avant et après les signes de ponctuation et les symboles* : https://vitrinelinguistique.oqlf.gouv.qc.ca/22039/la-typographie/espacement/espacement-avant-et-apres-les-signes-de-ponctuation-et-les-symboles

\---

