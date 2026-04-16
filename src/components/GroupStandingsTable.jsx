// src/components/GroupStandingsTable.jsx
import React from 'react';

export default function GroupStandingsTable({ groupLetter, standings, teamsMap, qualifiedThirds }) {
  return (
    <>
      <div className="section-header">Grupo {groupLetter}</div>
      <div className="standings-scroll-wrapper">
        <table className="standings-table">
          <colgroup>
            <col style={{width: '30px'}} />  {/* # */}
            <col style={{width: '34px'}} />  {/* bandeira */}
            <col />                           {/* nome - flexível */}
            <col style={{width: '42px'}} />  {/* Pts */}
            <col style={{width: '32px'}} />  {/* J */}
            <col style={{width: '32px'}} />  {/* V */}
            <col style={{width: '32px'}} />  {/* E */}
            <col style={{width: '32px'}} />  {/* D */}
            <col style={{width: '36px'}} />  {/* GP */}
            <col style={{width: '36px'}} />  {/* GC */}
            <col style={{width: '42px'}} />  {/* SG */}
          </colgroup>
          <thead>
            <tr>
              <th className="col-pos">#</th>
              <th className="col-team" colSpan={2}>Time</th>
              <th className="col-pts">Pts</th>
              <th>J</th>
              <th>V</th>
              <th>E</th>
              <th>D</th>
              <th>GP</th>
              <th>GC</th>
              <th>SG</th>
            </tr>
          </thead>
          <tbody>
            {standings.map(row => {
              const team = teamsMap[row.teamId];
              const isClassified = row.position <= 2;
              const isQualifiedThird = row.position === 3 && qualifiedThirds?.has(row.teamId);
              const rowClass = isClassified ? 'row-classified' : isQualifiedThird ? 'row-qualified-third' : '';

              return (
                <tr key={row.teamId} className={rowClass}>
                  <td className="col-pos">{row.position}</td>
                  <td className="col-flag">
                    {team?.flagUrl && (
                      <img src={team.flagUrl} alt={row.teamId} className="flag-img" />
                    )}
                  </td>
                  <td className="col-team-name">
                    <span className="desktop-only">{team?.name || row.teamId}</span>
                    <span className="mobile-only">{row.teamId}</span>
                  </td>
                  <td className="col-pts">{row.points}</td>
                  <td>{row.played}</td>
                  <td>{row.wins}</td>
                  <td>{row.draws}</td>
                  <td>{row.losses}</td>
                  <td>{row.goalsFor}</td>
                  <td>{row.goalsAgainst}</td>
                  <td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
