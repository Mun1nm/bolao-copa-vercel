// src/utils/standingsCalculator.js

/**
 * Calcula os pontos de confronto direto entre dois times.
 */
function computeH2HPoints(teamAId, teamBId, finishedMatches) {
  let pointsA = 0;
  let pointsB = 0;

  for (const m of finishedMatches) {
    const isAB = m.homeTeamId === teamAId && m.awayTeamId === teamBId;
    const isBA = m.homeTeamId === teamBId && m.awayTeamId === teamAId;
    if (!isAB && !isBA) continue;

    const hs = parseInt(m.homeScore);
    const as_ = parseInt(m.awayScore);

    if (hs > as_) {
      if (isAB) pointsA += 3; else pointsB += 3;
    } else if (hs < as_) {
      if (isAB) pointsB += 3; else pointsA += 3;
    } else {
      pointsA += 1;
      pointsB += 1;
    }
  }

  return { a: pointsA, b: pointsB };
}

/**
 * Calcula a classificacao de todos os grupos.
 *
 * @param {Array}  matches  - Lista de todos os jogos
 * @param {Object} teamsMap - Mapa { teamId: { id, name, flagUrl, group } }
 * @returns {Object} { [groupLetter]: TeamStanding[] } ordenado pelos criterios FIFA
 *
 * Retorna apenas grupos que tenham pelo menos 1 jogo cadastrado.
 * Times que ainda nao jogaram aparecem com stats zeradas.
 */
export function calculateGroupStandings(matches, teamsMap) {
  // Grupos que possuem ao menos 1 jogo cadastrado
  const groupsWithMatches = new Set(matches.map(m => m.group));

  // Inicializa stats para todos os times que pertencem a um grupo com jogos
  const statsPerGroup = {};

  Object.values(teamsMap).forEach(team => {
    if (!team.group || !groupsWithMatches.has(team.group)) return;

    if (!statsPerGroup[team.group]) statsPerGroup[team.group] = {};

    statsPerGroup[team.group][team.id] = {
      teamId: team.id,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    };
  });

  // Acumula stats dos jogos finalizados
  const finishedMatches = matches.filter(m => m.status === 'finished');

  finishedMatches.forEach(m => {
    const group = m.group;
    if (!statsPerGroup[group]) statsPerGroup[group] = {};

    const hs = parseInt(m.homeScore);
    const as_ = parseInt(m.awayScore);

    // Garante que o time existe no mapa (segurança extra)
    [m.homeTeamId, m.awayTeamId].forEach(tid => {
      if (!statsPerGroup[group][tid]) {
        statsPerGroup[group][tid] = { teamId: tid, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
      }
    });

    const home = statsPerGroup[group][m.homeTeamId];
    const away = statsPerGroup[group][m.awayTeamId];

    home.played += 1;
    away.played += 1;
    home.goalsFor += hs;
    home.goalsAgainst += as_;
    away.goalsFor += as_;
    away.goalsAgainst += hs;

    if (hs > as_) {
      home.wins += 1;
      away.losses += 1;
    } else if (hs < as_) {
      away.wins += 1;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
    }
  });

  // Monta resultado final por grupo
  const result = {};

  Object.keys(statsPerGroup).sort().forEach(group => {
    const groupFinishedMatches = finishedMatches.filter(m => m.group === group);

    const standings = Object.values(statsPerGroup[group]).map(s => ({
      ...s,
      goalDifference: s.goalsFor - s.goalsAgainst,
      points: s.wins * 3 + s.draws,
    }));

    standings.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;

      // Confronto direto
      const h2h = computeH2HPoints(a.teamId, b.teamId, groupFinishedMatches);
      return h2h.b - h2h.a;
    });

    result[group] = standings.map((s, i) => ({ ...s, position: i + 1 }));
  });

  return result;
}
