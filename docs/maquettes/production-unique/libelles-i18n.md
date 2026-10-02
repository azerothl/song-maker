# Libellés i18n `production.*` (produit sur main)

Légende : **[L]** lu dans `src/ui/fr.json` + `src/ui/en.production.json` sur `origin/main` @ `bfec8bbe2949fb6abccb0217b9dca1c7275efd61`.

- Clés `production.*` FR : **104** · EN : **104** · parité variables `{x}` : **OK** (0 écart).
- HTML maquette (`i18n.js` / `i18n.en.js`) **non publié** → les 11 clés « maquette uniquement » du critère E ne peuvent pas être vérifiées contre le pack HTML ici ; elles restent **hors produit** tant que le HTML n’est pas versionné.
- Aucune occurrence de « voie » / « tête de lecture » dans les valeurs FR `production.*` ([L]).

## Table FR / EN

| Clé | FR | EN | Variables |
|-----|----|----|-----------|
| `production.addTrack` | Ajouter une piste | Add track | — |
| `production.addTrack.empty` | Ajouter une piste vide | Add empty track | — |
| `production.addTrack.menu` | Menu Ajouter une piste | Add track menu | — |
| `production.arrangement.close` | Fermer | Close | — |
| `production.auto.addPlayback` | Ajouter à la position de lecture | Add at playback position | — |
| `production.auto.addPosition` | Ajouter à cette position | Add at this position | — |
| `production.auto.collapse` | Replier l’automation : {track} | Collapse automation: {track} | {track} |
| `production.auto.delete` | Supprimer le point {point} | Delete point {point} | {point} |
| `production.auto.empty` | Aucun point : le réglage de la piste reste actif. | No points: the track setting remains active. | — |
| `production.auto.laneNamed` | Courbe d’automation : {target} | Automation curve: {target} | {target} |
| `production.auto.locked` | Déverrouillez la piste pour modifier sa courbe d’automation. | Unlock the track to edit its automation curve. | — |
| `production.auto.point` | Point d’automation {index} — {time} ms, {value} {unit} | Automation point {index} — {time} ms, {value} {unit} | {index}, {time}, {unit}, {value} |
| `production.auto.points` | Nombre de points : {count} | Number of points: {count} | {count} |
| `production.auto.remove` | Supprimer | Delete | — |
| `production.auto.restore` | Rétablir la courbe | Restore curve | — |
| `production.auto.target` | Cible | Target | — |
| `production.auto.targetNamed` | Cible d’automation : {track} | Automation target: {track} | {track} |
| `production.auto.time` | Position (ms) | Position (ms) | — |
| `production.auto.track` | Automation de {track} | Automation for {track} | {track} |
| `production.common.advanced` | Automation, effets avancés et export | Automation, advanced effects and export | — |
| `production.common.clips` | Arrangement et clips | Arrangement and clips | — |
| `production.common.intro` | Mixez les pistes, éditez les clips et ouvrez les réglages avancés sur cette page. | Mix tracks, edit clips and open advanced settings on this page. | — |
| `production.common.mix` | Pistes et mixage | Tracks and mix | — |
| `production.common.timelineNamed` | Pistes, tempo et marqueurs sur la règle commune | Tracks, tempo and markers on the shared ruler | — |
| `production.edit.cut` | Découper [C] | Split [C] | — |
| `production.edit.cut.hint` | C : cliquer pour découper. X découpe à la position de lecture si elle est dans le clip, sinon son milieu. | C: click to split. X splits at the playback position inside the clip, or its midpoint otherwise. | — |
| `production.edit.fade` | Fondu [F] | Fade [F] | — |
| `production.edit.fade.hint` | F : glisser dans la moitié gauche ou droite pour régler le fondu. Les champs de fondu permettent aussi une saisie en ms. | F: drag in the left or right half to adjust the fade. Fade fields also accept values in ms. | — |
| `production.edit.marker` | Marqueur [M] | Marker [M] | — |
| `production.edit.marker.hint` | M : cliquer sur la lane Marqueurs ou sur un clip pour poser un marqueur. | M: click the Markers lane or a clip to place a marker. | — |
| `production.edit.select` | Sélection [V] | Select [V] | — |
| `production.edit.select.hint` | V : sélectionner et déplacer. Les bords rognent le clip ; les champs ci-dessous permettent une saisie en ms. | V: select and move. Edges trim the clip; the fields below accept values in ms. | — |
| `production.edit.title` | Édition des clips | Clip editing | — |
| `production.eq.bandNamed` | Bande {n} | Band {n} | {n} |
| `production.eq.missing` | Ajoutez un EQ paramétrique dans la ligne d’effets pour régler les bandes ici. | Add a parametric EQ in the effect chain to edit bands here. | — |
| `production.eq.popover` | Égaliseur de la piste : {track} | Track equalizer: {track} | {track} |
| `production.eq.popover.close` | Fermer l’égaliseur | Close equalizer | — |
| `production.fade.error.negative` | La durée du fondu doit être positive ou nulle. | Fade length must be zero or positive. | — |
| `production.fade.error.tooLong` | La somme des fondus dépasse la durée du clip. | Fade in and fade out together are longer than the clip duration. | — |
| `production.fx.line.close` | Fermer la ligne d’effets | Close effect chain | — |
| `production.fx.line.title` | Ligne d’effets : {track} | Effect chain: {track} | {track} |
| `production.fx.moveDownNamed` | Descendre : {effect} | Move down: {effect} | {effect} |
| `production.fx.moveUpNamed` | Monter : {effect} | Move up: {effect} | {effect} |
| `production.fx.noneSelected` | Sélectionnez un effet pour voir ses propriétés. | Select an effect to edit its properties. | — |
| `production.fx.openEq` | Ouvrir l’égaliseur | Open equalizer | — |
| `production.fx.removeNamed` | Retirer : {effect} | Remove: {effect} | {effect} |
| `production.marker.addNamed` | Ajouter ou modifier un marqueur | Add or edit a marker | — |
| `production.marker.flagNamed` | Marqueur : {name}, {time} | Marker: {name}, {time} | {name}, {time} |
| `production.mix.param.gainReductionNamed` | Réduction de gain (dernier rendu) : {value} | Gain reduction (last render): {value} | {value} |
| `production.mixSettings` | Réglages du mix | Mix settings | — |
| `production.mixSettings.close` | Fermer | Close | — |
| `production.mixSettings.densityLegend` | Hauteur des lignes | Line height | — |
| `production.mixSettings.grid` | Grille, aimantation et zoom | Grid, snap, and zoom | — |
| `production.mixSettings.sound` | Son | Sound | — |
| `production.mixSettings.title` | Réglages du mix | Mix settings | — |
| `production.mixSettings.toolsMenu` | Assistant de mix ou Copilote | Mix assistant or production copilot | — |
| `production.mixSettings.tracks` | Pistes | Tracks | — |
| `production.num.decimal` | , | . | — |
| `production.routing.defaultAux` | Bus auxiliaire {n} | Aux bus {n} | {n} |
| `production.routing.defaultGroup` | Bus de groupe {n} | Group bus {n} | {n} |
| `production.routing.popover` | Routage — {track} | Routing — {track} | {track} |
| `production.routing.sendsLegend` | Sends de cette piste | Sends from this track | — |
| `production.routing.sidechainDestFixed` | Destination : cette piste | Destination: this track | — |
| `production.ruler.value` | {time} ms, mesure {bar} | {time} ms, bar {bar} | {bar}, {time} |
| `production.rulerNamed` | Position de lecture, règle temporelle | Playback position, timeline ruler | — |
| `production.separate.disabledBusy` | Opération en cours — réessayez dans un instant. | Operation in progress — try again in a moment. | — |
| `production.separate.disabledNoGeneration` | Aucune prise active — générez ou sélectionnez une version pour séparer. | No active take — generate or select a version before separating. | — |
| `production.settings.master` | Master | Master | — |
| `production.settings.snap` | Aimantation | Snap | — |
| `production.status.markerAdded` | Marqueur « {name} » ajouté à {time}. | Marker “{name}” added at {time}. | {name}, {time} |
| `production.status.markerBounded` | Position du marqueur « {name} » limitée à {time}. | Marker “{name}” position limited to {time}. | {name}, {time} |
| `production.status.markerDeleted` | Marqueur « {name} » supprimé. | Marker “{name}” deleted. | {name} |
| `production.status.markerUpdated` | Marqueur « {name} » à {time}. | Marker “{name}” at {time}. | {name}, {time} |
| `production.status.tempoDeleted` | Changement de tempo supprimé à {time}. | Tempo change deleted at {time}. | {time} |
| `production.status.tempoSet` | Tempo {bpm} BPM à partir de {time}. | Tempo {bpm} BPM from {time}. | {bpm}, {time} |
| `production.strip.gain.valuetext` | {value} | {value} | {value} |
| `production.strip.invalid` | Valeur invalide. | Invalid value. | — |
| `production.strip.pan.valuetext` | {value} | {value} | {value} |
| `production.tempo.addNamed` | Ajouter un tempo à la position de lecture | Add tempo at the playback position | — |
| `production.tempo.deleteNamed` | Supprimer le tempo {bpm} BPM à {time} | Delete tempo {bpm} BPM at {time} | {bpm}, {time} |
| `production.tempo.flagNamed` | Tempo {bpm} BPM, {time} | Tempo {bpm} BPM, {time} | {bpm}, {time} |
| `production.track.auto.hint` | La courbe d’automation s’affiche sous la piste lorsque l’option est activée. | The automation curve appears under the track when the option is on. | — |
| `production.track.clipNone` | Aucun clip sélectionné sur cette piste. | No clip selected on this track. | — |
| `production.track.clipSel` | Clip {n} · {time} | Clip {n} · {time} | {n}, {time} |
| `production.track.close` | Fermer les réglages de la piste | Close track settings | — |
| `production.track.fades` | Fondus du clip sélectionné | Selected clip fades | — |
| `production.track.moreEq` | Égaliseur et effets… | Equalizer and effects… | — |
| `production.track.mute` | Muet : {track} | Mute: {track} | {track} |
| `production.track.muteSolo` | Muet et solo : {track} | Mute and solo: {track} | {track} |
| `production.track.popover` | Réglages de la piste : {track} | Track settings: {track} | {track} |
| `production.track.showAuto` | Automation sous la piste | Automation under track | — |
| `production.track.solo` | Solo : {track} | Solo: {track} | {track} |
| `production.track.tab.automation` | Automation | Automation | — |
| `production.track.tab.eq` | Égaliseur | Equalizer | — |
| `production.track.tab.fx` | Effets | Effects | — |
| `production.track.tab.routing` | Routage | Routing | — |
| `production.track.tab.settings` | Réglages | Settings | — |
| `production.track.tabs` | Réglages détaillés de la piste | Detailed track settings | — |
| `production.track.tools` | Réglages de la piste : {track} | Track settings: {track} | {track} |
| `production.unit.db` | dB | dB | — |
| `production.unit.dbPerOct` | {value} dB/oct | {value} dB/oct | {value} |
| `production.unit.dbValue` | {value} dB | {value} dB | {value} |
| `production.unit.ms` | {value} ms | {value} ms | {value} |
| `production.unit.zoom` | × | × | — |

## Clés liées écartées / hors pack HTML

- `production.panel.*`, `production.addDrawer.*` : **absentes** du produit ([L]) — panneau latéral et tiroir écartés.
- `production.frame.*` (exemple factice maquette) : **absentes** du produit ([L]).
- `production.undo.hint` : **absente** ([L]).

## Grille Gabriel (échantillon vérifié [L])

| Terme | Clé / valeur FR |
|-------|-----------------|
| Réglages du mix | `production.mix.settings` / usages liés |
| Courbe d’automation : {target} | `production.auto.laneNamed` |
| Découper / Split | `production.tool.cut` / édition clips |
| Aimantation | clés snap / `production.settings.*` |
| position de lecture | `production.auto.addPlayback`, etc. |

Relecture Gabriel sur SHA HTML maquette : **non faite** (HTML hors dépôt).
