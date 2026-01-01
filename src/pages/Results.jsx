import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { useParams } from 'react-router-dom';

export default function Results() {
  const { leagueId } = useParams();
  
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState({});
  const [loading, setLoading] = useState(true);

  // Estados dos Filtros
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

  // Processamento de Dados
  const getGroupedMatches = () => {
    let filtered = matches;
    if (filterGroup !== 'ALL') {
      filtered = matches.filter(m => m.group === filterGroup);
    }

    const grouped = {};
    filtered.forEach(match => {
      let key = '';
      if (groupBy === 'date') {
        // Formato classificável para garantir ordem correta se necessário, 
        // mas aqui estamos usando a string formatada. 
        // Se a ordenação alfabética da data formatada não for cronológica (ex: "Sábado" vem depois de "Quarta"),
        // a ordenação simples do sort() lá embaixo pode falhar visualmente.
        // O ideal para data seria manter um objeto complexo ou ordenar pela data real.
        // Para 'group', a ordenação alfabética funciona perfeito (Grupo A, Grupo B).
        const d = new Date(match.date);
        // Dica: Para ordenar datas corretamente, o ideal seria usar YYYY-MM-DD como chave oculta, 
        // mas vamos manter simples por enquanto.
        key = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', weekday: 'long' });
      } else {
        key = `Grupo ${match.group}`;
      }

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(match);
    });
    return grouped;
  };

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
          <h2 style={{color: 'var(--primary)', margin: 0, fontSize: '1.2rem'}}>Tabela de Jogos</h2>
        </div>

        <div style={{display: 'flex', gap: 10}}>
          {/* Botões Agrupamento */}
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

          <select 
            value={filterGroup} 
            onChange={(e) => setFilterGroup(e.target.value)}
            style={{padding: '6px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.8rem', outline:'none'}}
          >
            <option value="ALL">Todos</option>
            {uniqueGroups.map(g => <option key={g} value={g}>Grupo {g}</option>)}
          </select>
        </div>
      </div>

      {/* --- LISTA DE JOGOS (GRID) --- */}
      <div className="results-card">
        {Object.keys(groupedData).length === 0 && (
          <div style={{padding: 30, textAlign: 'center', color: '#666'}}>Nenhum jogo encontrado.</div>
        )}

        {/* MUDANÇA AQUI: .sort() garante a ordem A, B, C... */}
        {Object.keys(groupedData).sort().map(key => (
          <React.Fragment key={key}>
            {/* Cabeçalho da Seção */}
            <div className="section-header">{key}</div>

            {/* Linhas dos Jogos */}
            {groupedData[key].map(match => {
              const home = teams[match.homeTeamId];
              const away = teams[match.awayTeamId];
              if (!home || !away) return null;
              
              const isFinished = match.status === 'finished';
              const time = new Date(match.date).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});

              return (
                <div key={match.id} className="match-row">
                  {/* 1. Hora */}
                  <div className="cell-time">{time}</div>

                  {/* 2. Mandante */}
                  <div className="cell-team home">
                    <span className="team-name desktop-only">{home.name}</span>
                    <span className="team-name mobile-only">{home.id}</span> 
                    <img src={home.flagUrl} className="flag-img" alt={home.id} />
                  </div>

                  {/* 3. Placar */}
                  <div className="cell-score">
                    <div className={`score-badge ${isFinished ? 'finished' : ''}`}>
                      {isFinished ? `${match.homeScore} - ${match.awayScore}` : 'vs'}
                    </div>
                  </div>

                  {/* 4. Visitante */}
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
    </div>
  );
}