import React from 'react';

const time = (d) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

export default function UpdateBar({ status, onCheck }) {
  const { phase, result, checkedAt, error } = status;
  let kind = 'ok';
  let text = 'Prüfe auf neue Ziehungen …';

  if (phase !== 'checking' && checkedAt) {
    if (error === 'offline') { kind = 'warn'; text = 'Server-API nicht erreichbar.'; }
    else if (error) { kind = 'warn'; text = `Prüfung fehlgeschlagen: ${error}`; }
    else if (result.status === 'added') {
      kind = 'new';
      text = `${result.added.length} neue Ziehung(en) übernommen (${result.added.map((r) => r.split(';')[0]).join(', ')}) – alle Auswertungen wurden neu berechnet.`;
    } else if (result.status === 'unavailable') {
      kind = 'warn';
      text = `Ziehung vom ${result.expected} ist fällig, aber noch nicht in der Datenquelle. Nächster Versuch automatisch.`;
    } else text = `Daten aktuell (letzte Ziehung ${result.lastDate}).`;
    const pr = result?.predictions;
    if (pr?.evaluated?.length) text += ` Prognose für ${pr.evaluated.join(', ')} ausgewertet.`;
    if (pr?.created) text += ` Neue Prognose für ${pr.created} gespeichert.`;
    text += ` · geprüft um ${time(checkedAt)}`;
  }

  return (
    <div className={`updatebar ${kind}`} role="status">
      <span>{text}</span>
      <button onClick={onCheck} disabled={phase === 'checking'}>Jetzt prüfen</button>
    </div>
  );
}
