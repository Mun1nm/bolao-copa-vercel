import { useState, useEffect } from 'react';
import { db } from '../services/firebaseConfig';
import { collection, addDoc, getDocs, doc, setDoc, updateDoc, deleteDoc, query, where, writeBatch, increment } from 'firebase/firestore';

export default function Admin() {
  const [tab, setTab] = useState('results'); 
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  
  // LÓGICA DE VISUALIZAÇÃO DE GRUPOS (Para a aba Resultados)
  const [activeGroupResults, setActiveGroupResults] = useState('');
  const [uniqueGroups, setUniqueGroups] = useState([]);

  // ESTADOS DE EDIÇÃO
  const [editingTeam, setEditingTeam] = useState(null); 
  const [editingMatchId, setEditingMatchId] = useState(null); 

  // FORMS
  // Mudança 1: Removemos isoCode e adicionamos group no Time
  const [teamForm, setTeamForm] = useState({ id: '', name: '', flagUrl: '', group: '' });
  
  // Mudança 2: Estado auxiliar para filtrar a criação de jogos
  const [selectedGroupForMatch, setSelectedGroupForMatch] = useState('');
  const [matchForm, setMatchForm] = useState({ homeTeamId: '', awayTeamId: '', date: '' });
  
  const [scores, setScores] = useState({}); 

  // MODAL CONFIG
  const [modalConfig, setModalConfig] = useState({ 
    isOpen: false, title: '', message: '', action: null, isDestructive: false 
  });
  const closeModal = () => setModalConfig({ ...modalConfig, isOpen: false });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    // Carrega Times
    const teamsSnap = await getDocs(collection(db, 'teams'));
    const teamsList = teamsSnap.docs.map(d => ({id: d.id, ...d.data()}));
    setTeams(teamsList);

    // Carrega Jogos
    const matchesSnap = await getDocs(collection(db, 'matches'));
    const matchList = matchesSnap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => new Date(a.date) - new Date(b.date));
    setMatches(matchList);

    // Extrai Grupos Únicos dos JOGOS JÁCRIADOS para a navegação
    const groups = [...new Set(matchList.map(m => m.group))].sort();
    setUniqueGroups(groups);
    if (groups.length > 0 && !activeGroupResults) setActiveGroupResults(groups[0]);
  };

  // --- TIMES (LÓGICA NOVA) ---
  const handleSaveTeam = async (e) => {
    e.preventDefault();
    if (!teamForm.group || teamForm.group.length !== 1) {
      setMsg("O grupo deve ter apenas 1 letra (Ex: A, B, G).");
      return;
    }

    try {
      const teamId = teamForm.id.toUpperCase();
      const groupUpper = teamForm.group.toUpperCase();

      const payload = { 
        id: teamId, 
        name: teamForm.name, 
        flagUrl: teamForm.flagUrl,
        group: groupUpper // Agora o time "sabe" qual é seu grupo
      };

      if (editingTeam) {
        await updateDoc(doc(db, 'teams', teamForm.id), payload);
        setMsg('Time atualizado!');
      } else {
        await setDoc(doc(db, 'teams', teamId), payload);
        setMsg('Time criado!');
      }
      loadData(); setEditingTeam(null); setTeamForm({ id: '', name: '', flagUrl: '', group: '' });
    } catch (error) { console.error(error); setMsg('Erro ao salvar time.'); }
  };

  const handleEditTeamClick = (team) => {
    setEditingTeam(team); 
    // Garante que o form receba o grupo existente ou vazio
    setTeamForm({ ...team, group: team.group || '' }); 
    setTab('teams'); 
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- JOGOS (LÓGICA NOVA) ---
  
  // Filtra os times baseado no grupo selecionado no Dropdown
  const availableTeams = teams.filter(t => t.group === selectedGroupForMatch);

  const handleCreateMatch = async (e) => {
    e.preventDefault();
    if (!selectedGroupForMatch) { setMsg("Selecione um grupo primeiro."); return; }

    try {
      await addDoc(collection(db, 'matches'), { 
        ...matchForm, 
        group: selectedGroupForMatch, // Usa o grupo do filtro
        status: 'scheduled', 
        homeScore: null, 
        awayScore: null 
      });
      setMsg('Jogo criado!'); loadData();
    } catch (error) { setMsg('Erro ao criar jogo.'); }
  };

  // --- RESULTADOS: LÓGICA DE CONFIRMAÇÃO ---
  const executeUpdateResult = async (matchId) => {
    setLoading(true); closeModal();
    const score = scores[matchId];
    const homeScore = parseInt(score?.home);
    const awayScore = parseInt(score?.away);

    try {
      const batch = writeBatch(db);
      const matchRef = doc(db, 'matches', matchId);
      
      // 1. Atualiza o placar do jogo
      batch.update(matchRef, { status: 'finished', homeScore, awayScore });

      // 2. Busca TODOS os palpites para este jogo (de todos os bolões)
      const guessesSnap = await getDocs(query(collection(db, 'guesses'), where('matchId', '==', matchId)));
      
      guessesSnap.forEach(guessDoc => {
        const guess = guessDoc.data();
        
        // Se for um palpite antigo sem leagueId, ignoramos (ou tratamos como legado)
        if (!guess.leagueId) return;

        const oldPoints = guess.pointsEarned || 0; 
        let newPoints = 0; 
        let isExact = false;
        
        const gH = guess.homeGuess; 
        const gA = guess.awayGuess;

        // Regra de Pontuação (Padrão)
        if (gH === homeScore && gA === awayScore) { 
          newPoints = 3; isExact = true; 
        } else {
          const realWinner = homeScore > awayScore ? 'home' : (homeScore < awayScore ? 'away' : 'draw');
          const guessWinner = gH > gA ? 'home' : (gH < gA ? 'away' : 'draw');
          if (realWinner === guessWinner) newPoints = 1;
        }

        const deltaPoints = newPoints - oldPoints;
        let deltaExact = 0;
        if (oldPoints === 3 && newPoints !== 3) deltaExact = -1;
        if (oldPoints !== 3 && newPoints === 3) deltaExact = 1;

        if (deltaPoints !== 0 || deltaExact !== 0) {
          // A. Atualiza o documento do Palpite
          batch.update(guessDoc.ref, { pointsEarned: newPoints });

          // B. Atualiza o MEMBRO DENTRO DO BOLÃO ESPECÍFICO (Não mais o User global)
          const memberRef = doc(db, 'leagues', guess.leagueId, 'members', guess.userId);
          batch.update(memberRef, { 
            totalPoints: increment(deltaPoints), 
            exactHits: increment(deltaExact) 
          });
        }
      });

      await batch.commit();
      setMsg('Ranking de todos os bolões atualizado!'); 
      setEditingMatchId(null); loadData();

    } catch (error) { console.error(error); setMsg('Erro ao atualizar.'); } 
    finally { setLoading(false); }
  };

  const confirmUpdateResult = (matchId) => {
    const score = scores[matchId];
    if (!score && !editingMatchId) return; 
    const homeScore = parseInt(score?.home);
    const awayScore = parseInt(score?.away);
    if (isNaN(homeScore) || isNaN(awayScore)) { setMsg("Placar inválido"); return; }

    setModalConfig({
        isOpen: true, title: 'Finalizar Jogo',
        message: `Confirmar placar ${homeScore} x ${awayScore}?`,
        action: () => executeUpdateResult(matchId), isDestructive: false
    });
  };

  const executeUnfinishMatch = async (matchId) => {
    setLoading(true); closeModal();
    try {
      const batch = writeBatch(db);
      const matchRef = doc(db, 'matches', matchId);
      batch.update(matchRef, { status: 'scheduled', homeScore: null, awayScore: null });
      
      const guessesSnap = await getDocs(query(collection(db, 'guesses'), where('matchId', '==', matchId)));
      
      guessesSnap.forEach(guessDoc => {
        const guess = guessDoc.data();
        if (!guess.leagueId) return;

        const pointsToRemove = guess.pointsEarned || 0;
        
        if (pointsToRemove > 0) {
          batch.update(guessDoc.ref, { pointsEarned: 0 });
          
          // Reverte pontos na subcoleção de membros
          const memberRef = doc(db, 'leagues', guess.leagueId, 'members', guess.userId);
          batch.update(memberRef, { 
            totalPoints: increment(-pointsToRemove), 
            exactHits: increment(pointsToRemove === 3 ? -1 : 0) 
          });
        }
      });
      
      await batch.commit(); setMsg('Jogo reaberto.'); loadData();
    } catch (error) { console.error(error); setMsg('Erro ao reverter.'); } 
    finally { setLoading(false); }
  };

  const confirmUnfinishMatch = (matchId) => {
      setModalConfig({
          isOpen: true, title: 'Reabrir Jogo',
          message: 'ATENÇÃO: Isso removerá os pontos deste jogo de TODOS os usuários.',
          action: () => executeUnfinishMatch(matchId), isDestructive: true
      });
  };

  const executeDeleteMatch = async (matchId) => {
    setLoading(true); 
    closeModal();
    try {
      // Deleta o documento do jogo
      await deleteDoc(doc(db, 'matches', matchId));
      
      // Atualiza a lista na tela removendo o jogo excluído
      setMatches(prev => prev.filter(m => m.id !== matchId));
      setMsg('Jogo excluído com sucesso.');
    } catch (error) {
      console.error(error);
      setMsg('Erro ao excluir jogo.');
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteMatch = (match) => {
    // Aviso extra de segurança
    const warning = match.status === 'finished' 
      ? "ATENÇÃO: Este jogo está FINALIZADO. Se você excluí-lo agora, os pontos já distribuídos NÃO serão removidos dos usuários. O ideal é 'Reabrir' o jogo antes de excluir. Deseja excluir mesmo assim?"
      : "Tem certeza que deseja excluir este jogo permanentemente?";

    setModalConfig({
      isOpen: true,
      title: 'Excluir Jogo',
      message: warning,
      action: () => executeDeleteMatch(match.id),
      isDestructive: true // Botão vermelho
    });
  };

  const filteredMatches = matches.filter(m => m.group === activeGroupResults);

  return (
    <div className="container">
      {/* MODAL */}
      {modalConfig.isOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{modalConfig.title}</div>
            <p className="modal-text">{modalConfig.message}</p>
            <div className="modal-actions">
              <button onClick={closeModal} className="btn-secondary" style={{border:'none'}}>Cancelar</button>
              <button onClick={modalConfig.action} className={`btn-sm ${modalConfig.isDestructive ? 'btn-danger' : 'btn-success'}`} style={{padding: '0.6rem 1.2rem'}}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      <h2 style={{ marginBottom: '1.5rem', color: 'var(--primary)' }}>⚙️ Painel Admin</h2>
      
      <div className="tab-group">
        <button className={`tab-btn ${tab === 'results' ? 'active' : ''}`} onClick={()=>setTab('results')}>Resultados</button>
        <button className={`tab-btn ${tab === 'matches' ? 'active' : ''}`} onClick={()=>setTab('matches')}>Novo Jogo</button>
        <button className={`tab-btn ${tab === 'teams' ? 'active' : ''}`} onClick={()=>setTab('teams')}>Times</button>
      </div>

      {msg && <div style={{padding: '1rem', background: '#dcfce7', color: '#166534', marginBottom: '1.5rem', borderRadius: '8px', fontWeight: '600'}}>{msg}</div>}

      {/* --- ABA RESULTADOS --- */}
      {tab === 'results' && (
        <>
          <div className="groups-nav">
            {uniqueGroups.map(group => (
              <button key={group} className={`group-tab ${activeGroupResults === group ? 'active' : ''}`} onClick={() => setActiveGroupResults(group)}>
                Grupo {group}
              </button>
            ))}
          </div>

          <div className="matches-grid">
            {filteredMatches.length === 0 && <p>Sem jogos neste grupo.</p>}
            {filteredMatches.map(m => {
              const h = teams.find(t=>t.id === m.homeTeamId);
              const a = teams.find(t=>t.id === m.awayTeamId);
              if(!h || !a) return null;
              const isEditing = editingMatchId === m.id;
              const isFinished = m.status === 'finished';

              return (
                <div key={m.id} className="card-jogo" style={{ borderColor: isEditing ? 'var(--accent)' : ''}}>
                  <div className="card-content">
                    <div className="match-info" style={{marginTop: 0, marginBottom: '1rem', borderTop: 'none'}}>
                      {isFinished ? '✅ FINALIZADO' : '📅 AGENDADO'}
                    </div>
                    <div className="match-header">
                      <div className="team-box"><img src={h.flagUrl} alt={h.name}/><span>{h.id}</span></div>
                      {isFinished && !isEditing ? (
                        <div style={{fontWeight:'700', fontSize:'1.5rem'}}>{m.homeScore} - {m.awayScore}</div>
                      ) : (
                        <div className="score-box">
                          <input className="score-input" type="number" placeholder={isEditing?m.homeScore:''} onChange={(e)=>setScores({...scores, [m.id]: {...scores[m.id], home: e.target.value}})} />
                          <span>×</span>
                          <input className="score-input" type="number" placeholder={isEditing?m.awayScore:''} onChange={(e)=>setScores({...scores, [m.id]: {...scores[m.id], away: e.target.value}})} />
                        </div>
                      )}
                      <div className="team-box"><img src={a.flagUrl} alt={a.name}/><span>{a.id}</span></div>
                    </div>
                    <div style={{
                      display: 'flex', 
                      justifyContent: 'center', // Centraliza o conteúdo principal
                      alignItems: 'center',
                      marginTop: '1.5rem', 
                      position: 'relative', // <--- Importante para o botão de excluir funcionar
                      minHeight: '40px' // Garante altura caso só tenha o botão de excluir
                    }}>
                      {/* --- BOTÕES CENTRAIS (Finalizar / Salvar / Reabrir) --- */}
                        <div style={{display: 'flex', gap: '0.5rem'}}>
                          {(!isFinished || isEditing) && (
                            <button className="login-btn" style={{marginTop:0, padding:'0.5rem 1.5rem', width: 'auto'}} onClick={() => confirmUpdateResult(m.id)} disabled={loading}>
                              {loading ? '...' : (isEditing ? 'Salvar Placar' : 'Finalizar Jogo')}
                            </button>
                          )}

                          {isFinished && !isEditing && (
                            <>
                              <button onClick={() => setEditingMatchId(m.id)} className="btn-secondary" title="Editar Placar">✏️</button>
                              <button onClick={() => confirmUnfinishMatch(m.id)} className="btn-secondary" style={{color: '#f59e0b', borderColor: '#f59e0b'}} title="Reabrir">↩</button>
                            </>
                          )}

                          {isEditing && (
                            <button onClick={() => setEditingMatchId(null)} className="btn-secondary" style={{color: '#666'}}>Cancelar</button>
                          )}
                        </div>

                        {/* --- BOTÃO DE EXCLUIR (No Canto Direito) --- */}
                        {!isEditing && (
                          <button 
                            onClick={() => confirmDeleteMatch(m)} 
                            className="btn-delete-x"
                            style={{
                              position: 'absolute', // Tira ele do fluxo para não empurrar o centro
                              right: 0,             // Cola na direita
                              top: '50%',           // Centraliza verticalmente
                              transform: 'translateY(-50%)' // Ajuste fino vertical
                            }}
                            title="Excluir Jogo"
                          >
                            ✕
                          </button>
                        )}

                      </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* --- ABA NOVO JOGO (LÓGICA NOVA) --- */}
      {tab === 'matches' && (
        <div className="card-jogo">
          <div className="card-content">
            <h3 style={{marginBottom: '1rem'}}>Agendar Novo Jogo</h3>
            <form onSubmit={handleCreateMatch} className="admin-form">
              
              {/* Passo 1: Escolher o Grupo */}
              <div>
                <label className="form-label">Selecione o Grupo</label>
                <input 
                  className="form-input" 
                  placeholder="Ex: G (Digite para filtrar os times)" 
                  value={selectedGroupForMatch} 
                  maxLength={1}
                  onChange={e => {
                    const val = e.target.value.toUpperCase();
                    setSelectedGroupForMatch(val);
                    // Reseta os times selecionados se mudar o grupo
                    setMatchForm(prev => ({...prev, homeTeamId: '', awayTeamId: ''}));
                  }}
                />
              </div>

              {/* Passo 2: Dropdowns filtrados */}
              <div style={{display: 'flex', gap: '1rem'}}>
                <div style={{flex: 1}}>
                    <label className="form-label">Time da Casa</label>
                    <select 
                        className="form-input" 
                        value={matchForm.homeTeamId}
                        disabled={!selectedGroupForMatch}
                        onChange={e => setMatchForm({...matchForm, homeTeamId: e.target.value})}
                    >
                    <option value="">Selecione...</option>
                    {availableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                </div>
                <div style={{flex: 1}}>
                    <label className="form-label">Time Visitante</label>
                    <select 
                        className="form-input" 
                        value={matchForm.awayTeamId}
                        disabled={!selectedGroupForMatch}
                        onChange={e => setMatchForm({...matchForm, awayTeamId: e.target.value})}
                    >
                    <option value="">Selecione...</option>
                    {availableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                </div>
              </div>

              <div>
                  <label className="form-label">Data e Hora</label>
                  <input type="datetime-local" className="form-input" onChange={e => setMatchForm({...matchForm, date: e.target.value})} />
              </div>
              
              <button className="login-btn" disabled={!selectedGroupForMatch}>Agendar Jogo</button>
            </form>
          </div>
        </div>
      )}

      {/* --- ABA TIMES (LÓGICA NOVA) --- */}
      {tab === 'teams' && (
        <>
          <div className="card-jogo">
            <div className="card-content">
              <h3 style={{marginBottom: '1rem'}}>{editingTeam ? `Editar ${editingTeam.name}` : 'Cadastrar Novo Time'}</h3>
              <form onSubmit={handleSaveTeam} className="admin-form">
                <div style={{display: 'flex', gap: '1rem'}}>
                  <div style={{flex: 1}}>
                    <label className="form-label">Sigla (ID)</label>
                    <input className="form-input" placeholder="Ex: BRA" value={teamForm.id} disabled={!!editingTeam} onChange={e => setTeamForm({...teamForm, id: e.target.value})} />
                  </div>
                  <div style={{flex: 2}}>
                    <label className="form-label">Nome do País</label>
                    <input className="form-input" placeholder="Ex: Brasil" value={teamForm.name} onChange={e => setTeamForm({...teamForm, name: e.target.value})} />
                  </div>
                </div>
                
                <div style={{display: 'flex', gap: '1rem'}}>
                  <div style={{flex: 1}}>
                    {/* CAMPO DE GRUPO NOVO */}
                    <label className="form-label">Grupo</label>
                    <input 
                        className="form-input" 
                        placeholder="A" 
                        maxLength={1}
                        value={teamForm.group} 
                        onChange={e => setTeamForm({...teamForm, group: e.target.value.toUpperCase()})} 
                    />
                  </div>
                  <div style={{flex: 2}}>
                    <label className="form-label">URL da Bandeira</label>
                    <input className="form-input" placeholder="https://..." value={teamForm.flagUrl} onChange={e => setTeamForm({...teamForm, flagUrl: e.target.value})} />
                  </div>
                </div>
                
                <div style={{display: 'flex', gap: '1rem'}}>
                  <button className="login-btn" style={{flex: 1}}>Salvar Time</button>
                  {editingTeam && <button type="button" className="btn-secondary" onClick={()=>{setEditingTeam(null); setTeamForm({id:'',name:'',flagUrl:'', group:''})}}>Cancelar</button>}
                </div>
              </form>
            </div>
          </div>
          <div className="teams-grid">
            {teams.map(t => (
              <div key={t.id} className="team-card-mini">
                <img src={t.flagUrl} width="40" alt={t.name} style={{borderRadius: '4px'}}/>
                <div style={{fontWeight: 'bold'}}>{t.id}</div>
                {/* Mostra o Grupo no card do time */}
                <div style={{fontSize: '0.8rem', color: 'var(--primary)', fontWeight:'bold'}}>Grupo {t.group || '?'}</div>
                <button onClick={() => handleEditTeamClick(t)} className="btn-secondary" style={{width: '100%', marginTop: '0.5rem', fontSize: '0.8rem'}}>Editar</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}