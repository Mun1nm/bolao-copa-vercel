import React, { useEffect, useState, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { useParams } from 'react-router-dom';
import { calculateGroupStandings } from '../utils/standingsCalculator';
import GroupStandingsTable from '../components/GroupStandingsTable';

export default function Results() {
  const { leagueId } = useParams();

  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState({});
  const [loading, setLoading] = useState(true);

  // Estados dos Filtros
  const [viewMode, setViewMode] = useState('matches'); // 'matches' | 'standings'
  const [groupBy, setGroupBy] = useState('group'); // 'group' ou 'date'
  const [filterGroup, setFilterGroup] = useState('ALL');
  const [uniqueGroups, setUniqueGroups] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        // 1. Carregar Times (DIRETO DO BANCO - SEM CACHE)
        const teamsSnap = await getDocs(collection(db, 'teams'));
        const teamsMap = {};
        teamsSnap.forEach(t => teamsMap[t.id] = { id: t.id, ...t.data() });
        setTeams(teamsMap);

        // 2. Carregar Jogos
        const matchesSnap = await getDocs(collection(db, 'matches'));
        const matchList = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a,b) => new Date(a.date) - new Date(b.date));

        setMatches(matchList);

        // 3. Configurar Grupos
        const groups = [...new Set(matchList.map(m => m.group))].sort();
        setUniqueGroups(groups);

      } catch (error) {
        console.error("Erro ao carregar resultados:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [leagueId]);

  // Calcula classificacao (memoizado)
  const allStandings = useMemo(
    () => calculateGroupStandings(matches, teams),
    [matches, teams]
  );

  // Calcula os 8 melhores 3os colocados entre todos os grupos
  const qualifiedThirds = useMemo(() => {
    const thirds = Object.values(allStandings)
      .map(standings => standings[2]) // posicao 3 (indice 2)
      .filter(Boolean);

    thirds.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return 0;
    });

    return new Set(thirds.slice(0, 8).map(t => t.teamId));
  }, [allStandings]);

  // Processamento de Dados - Jogos
  const getGroupedMatches = () => {
    let filtered = matches;
    if (filterGroup !== 'ALL') {
      filtered = matches.filter(m => m.group === filterGroup);
    }

    const grouped = {};
    filtered.forEach(match => {
      let key = '';
      if (groupBy === 'date') {
        const d = new Date(match.date);
        key = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', weekday: 'long' });
      } else {
        key = `Grupo ${match.group}`;
      }

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(match);
    });
    return grouped;
  };

  // Grupos a exibir na view de classificacao
  const standingGroupsToShow = useMemo(() => {
    const allGroups = Object.keys(allStandings).sort();
    if (filterGroup !== 'ALL') return allGroups.filter(g => g === filterGroup);
    return allGroups;
  }, [allStandings, filterGroup]);

  const groupedData = getGroupedMatches();

  if (loading) return <div className="container">Carregando...</div>;

  return (
    <div className="container">
      {/* --- HEADER DE FILTROS --- */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 15, justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 20, background: 'white', padding: 15, borderRadius: 12, border: '1px solid #e2e8f0'
      }}>
        <div>
          <h2 style={{color: 'var(--primary)', margin: 0, fontSize: '1.2rem'}}>
            {viewMode === 'matches' ? 'Tabela de Jogos' : 'Classificacao dos Grupos'}
          </h2>
        </div>

        <div style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
          {/* Toggle Jogos / Classificacao */}
          <div style={{display:'flex', border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden'}}>
            <button
              onClick={() => setViewMode('matches')}
              style={{
                padding: '6px 12px', background: viewMode === 'matches' ? 'var(--primary)' : '#fff',
                color: viewMode === 'matches' ? 'white' : '#64748b', border: 'none', cursor: 'pointer', fontSize: '0.8rem'
              }}
            >
              Jogos
            </button>
            <button
              onClick={() => setViewMode('standings')}
              style={{
                padding: '6px 12px', background: viewMode === 'standings' ? 'var(--primary)' : '#fff',
                color: viewMode === 'standings' ? 'white' : '#64748b', border: 'none', cursor: 'pointer', fontSize: '0.8rem'
              }}
            >
              Classificacao
            </button>
          </div>

          {/* Botoes Agrupamento (apenas na view de jogos) */}
          {viewMode === 'matches' && (
            <div style={{display:'flex', border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden'}}>
              <button
                onClick={() => setGroupBy('group')}
                style={{
                  padding: '6px 12px', background: groupBy === 'group' ? 'var(--primary)' : '#fff',
                  color: groupBy === 'group' ? 'white' : '#64748b', border: 'none', cursor: 'pointer', fontSize: '0.8rem'
                }}
              >
                Grupo
              </button>
              <button
                onClick={() => setGroupBy('date')}
                style={{
                  padding: '6px 12px', background: groupBy === 'date' ? 'var(--primary)' : '#fff',
                  color: groupBy === 'date' ? 'white' : '#64748b', border: 'none', cursor: 'pointer', fontSize: '0.8rem'
                }}
              >
                Data
              </button>
            </div>
          )}

          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            style={{padding: '6px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.8rem', outline:'none'}}
          >
            <option value="ALL">Todos os Grupos</option>
            {uniqueGroups.map(g => <option key={g} value={g}>Grupo {g}</option>)}
          </select>
        </div>
      </div>

      {/* --- VIEW: JOGOS --- */}
      {viewMode === 'matches' && (
        <div className="results-card">
          {Object.keys(groupedData).length === 0 && (
            <div style={{padding: 30, textAlign: 'center', color: '#666'}}>Nenhum jogo encontrado.</div>
          )}

          {Object.keys(groupedData).sort().map(key => (
            <React.Fragment key={key}>
              <div className="section-header">{key}</div>

              {groupedData[key].map(match => {
                const home = teams[match.homeTeamId];
                const away = teams[match.awayTeamId];
                if (!home || !away) return null;

                const isFinished = match.status === 'finished';
                const time = new Date(match.date).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});

                return (
                  <div key={match.id} className="match-row">
                    <div className="cell-time">{time}</div>

                    <div className="cell-team home">
                      <span className="team-name desktop-only">{home.name}</span>
                      <span className="team-name mobile-only">{home.id}</span>
                      <img src={home.flagUrl} className="flag-img" alt={home.id} />
                    </div>

                    <div className="cell-score">
                      <div className={`score-badge ${isFinished ? 'finished' : ''}`}>
                        {isFinished ? `${match.homeScore} - ${match.awayScore}` : 'vs'}
                      </div>
                    </div>

                    <div className="cell-team away">
                      <img src={away.flagUrl} className="flag-img" alt={away.id} />
                      <span className="team-name desktop-only">{away.name}</span>
                      <span className="team-name mobile-only">{away.id}</span>
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* --- VIEW: CLASSIFICACAO --- */}
      {viewMode === 'standings' && (
        <div>
          {standingGroupsToShow.length === 0 && (
            <div className="results-card" style={{padding: 30, textAlign: 'center', color: '#666'}}>
              Nenhum grupo com jogos cadastrados.
            </div>
          )}

          {standingGroupsToShow.length > 0 && (
            <>
              {/* Legenda */}
              <div style={{display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, fontSize: '0.75rem', color: '#64748b'}}>
                <span style={{display:'flex', alignItems:'center', gap:5}}>
                  <span style={{width:10,height:10,background:'rgba(34,197,94,0.15)',border:'2px solid #22c55e',borderRadius:2,display:'inline-block',flexShrink:0}}></span>
                  Classificados (1º e 2º)
                </span>
                <span style={{display:'flex', alignItems:'center', gap:5}}>
                  <span style={{width:10,height:10,background:'rgba(234,179,8,0.12)',border:'2px solid #eab308',borderRadius:2,display:'inline-block',flexShrink:0}}></span>
                  Possiveis 3ºs classificados (8 melhores)
                </span>
              </div>

              {/* Cards por grupo */}
              <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                {standingGroupsToShow.map(group => (
                  <div key={group} className="results-card">
                    <GroupStandingsTable
                      groupLetter={group}
                      standings={allStandings[group]}
                      teamsMap={teams}
                      qualifiedThirds={qualifiedThirds}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
