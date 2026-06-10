import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/firebaseConfig';
import { collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, query, where, writeBatch, increment, Timestamp } from 'firebase/firestore';
import { useAdmin } from '../hooks/useAdmin';

export default function Admin() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [tab, setTab] = useState('results'); 
  const [loading, setLoading] = useState(false);
  
  const [toast, setToast] = useState(null);

  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [activeGroupResults, setActiveGroupResults] = useState('');
  const [uniqueGroups, setUniqueGroups] = useState([]);
  const [editingTeam, setEditingTeam] = useState(null); 
  const [editingMatchId, setEditingMatchId] = useState(null); 
  const [teamForm, setTeamForm] = useState({ id: '', name: '', flagUrl: '', group: '' });
  const [selectedGroupForMatch, setSelectedGroupForMatch] = useState('');
  const [matchForm, setMatchForm] = useState({ homeTeamId: '', awayTeamId: '', date: '' });
  const [scores, setScores] = useState({}); 
  const [modalConfig, setModalConfig] = useState({ 
    isOpen: false, title: '', message: '', action: null, isDestructive: false 
  });

  const getBrasiliaDate = (dateValue) => new Date(`${dateValue}:00-03:00`);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const closeModal = () => setModalConfig({ ...modalConfig, isOpen: false });

  const loadData = useCallback(async () => {
    if (!isAdmin) return;

    const teamsSnap = await getDocs(collection(db, 'teams'));
    const teamsList = teamsSnap.docs.map(d => ({id: d.id, ...d.data()}));
    setTeams(teamsList);

    const matchesSnap = await getDocs(collection(db, 'matches'));
    const matchList = matchesSnap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => new Date(a.date) - new Date(b.date));
    setMatches(matchList);

    const groups = [...new Set(matchList.map(m => m.group))].sort();
    setUniqueGroups(groups);
    if (groups.length > 0 && !activeGroupResults) setActiveGroupResults(groups[0]);
  }, [activeGroupResults, isAdmin]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveTeam = async (e) => {
    e.preventDefault();
    if (!teamForm.group || teamForm.group.length !== 1) {
      showToast("O grupo deve ter apenas 1 letra (Ex: A, B, G).");
      return;
    }

    try {
      const teamId = teamForm.id.toUpperCase();
      const groupUpper = teamForm.group.toUpperCase();

      const payload = { 
        id: teamId, 
        name: teamForm.name, 
        flagUrl: teamForm.flagUrl,
        group: groupUpper
      };

      if (editingTeam) {
        await updateDoc(doc(db, 'teams', teamForm.id), payload);
        showToast('Time atualizado!');
      } else {
        await setDoc(doc(db, 'teams', teamId), payload);
        showToast('Time criado!');
      }
      loadData(); setEditingTeam(null); setTeamForm({ id: '', name: '', flagUrl: '', group: '' });
    } catch (error) { console.error(error); showToast('Erro ao salvar time.'); }
  };

  const handleEditTeamClick = (team) => {
    setEditingTeam(team); 
    setTeamForm({ ...team, group: team.group || '' }); 
    setTab('teams'); 
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const availableTeams = teams.filter(t => t.group === selectedGroupForMatch);

  const handleCreateMatch = async (e) => {
    e.preventDefault();
    if (!selectedGroupForMatch) { showToast("Selecione um grupo primeiro."); return; }
    if (!matchForm.homeTeamId || !matchForm.awayTeamId || !matchForm.date) {
      showToast("Preencha os times e a data do jogo.");
      return;
    }

    try {
      const startAt = getBrasiliaDate(matchForm.date);
      await addDoc(collection(db, 'matches'), { 
        ...matchForm, 
        startAt: Timestamp.fromDate(startAt),
        group: selectedGroupForMatch,
        status: 'scheduled', 
        homeScore: null, 
        awayScore: null 
      });
      showToast('Jogo criado!'); 
      loadData();
      
      // --- MUDANÇA 1: Limpa os campos para evitar repetição ---
      setMatchForm({ homeTeamId: '', awayTeamId: '', date: '' }); 
      
    } catch { showToast('Erro ao criar jogo.'); }
  };

  const queueExistingMemberUpdates = async (batch, memberUpdatesData, getUpdatePayload) => {
    const memberRefs = memberUpdatesData.map((data) => ({
      data,
      ref: doc(db, 'leagues', data.leagueId, 'members', data.userId)
    }));
    const memberSnaps = await Promise.all(memberRefs.map(({ ref }) => getDoc(ref)));

    memberSnaps.forEach((memberSnap, index) => {
      if (!memberSnap.exists()) {
        console.warn(`Membro ${memberRefs[index].data.userId} não encontrado.`);
        return;
      }
      batch.update(memberRefs[index].ref, getUpdatePayload(memberRefs[index].data));
    });
  };

  const executeUpdateResult = async (matchId) => {
    setLoading(true); closeModal();
    const score = scores[matchId];
    const homeScore = parseInt(score?.home);
    const awayScore = parseInt(score?.away);

    try {
      const batch = writeBatch(db);
      const matchRef = doc(db, 'matches', matchId);
      
      batch.update(matchRef, { status: 'finished', homeScore, awayScore });

      const guessesSnap = await getDocs(query(collection(db, 'guesses'), where('matchId', '==', matchId)));
      const memberUpdatesData = [];

      guessesSnap.forEach(guessDoc => {
        const guess = guessDoc.data();
        if (!guess.leagueId) return;

        const oldPoints = guess.pointsEarned || 0; 
        let newPoints = 0; 
        const gH = guess.homeGuess; 
        const gA = guess.awayGuess;

        if (gH === homeScore && gA === awayScore) { 
          newPoints = 3;
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
          batch.update(guessDoc.ref, { pointsEarned: newPoints });
          memberUpdatesData.push({
            leagueId: guess.leagueId,
            userId: guess.userId,
            deltaPoints,
            deltaExact
          });
        }
      });

      await queueExistingMemberUpdates(batch, memberUpdatesData, (data) => ({
          totalPoints: increment(data.deltaPoints),
          exactHits: increment(data.deltaExact)
      }));

      await batch.commit();

      showToast('Ranking atualizado!'); 
      setEditingMatchId(null); loadData();

    } catch (error) { console.error(error); showToast('Erro ao atualizar.'); } 
    finally { setLoading(false); }
  };

  const confirmUpdateResult = (matchId) => {
    const score = scores[matchId];
    if (!score && !editingMatchId) return; 
    const homeScore = parseInt(score?.home);
    const awayScore = parseInt(score?.away);
    if (isNaN(homeScore) || isNaN(awayScore)) { showToast("Placar inválido"); return; }

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
      const memberUpdatesData = [];
      
      guessesSnap.forEach(guessDoc => {
        const guess = guessDoc.data();
        if (!guess.leagueId) return;

        const pointsToRemove = guess.pointsEarned || 0;
        
        if (pointsToRemove > 0) {
          batch.update(guessDoc.ref, { pointsEarned: 0 });
          memberUpdatesData.push({
            leagueId: guess.leagueId,
            userId: guess.userId,
            pointsToRemove,
            wasExact: pointsToRemove === 3
          });
        }
      });
      
      await queueExistingMemberUpdates(batch, memberUpdatesData, (data) => ({
          totalPoints: increment(-data.pointsToRemove),
          exactHits: increment(data.wasExact ? -1 : 0)
      }));

      await batch.commit();

      showToast('Jogo reaberto.'); loadData();
    } catch (error) { console.error(error); showToast('Erro ao reverter.'); } 
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
      const matchRef = doc(db, 'matches', matchId);
      const matchSnap = await getDoc(matchRef);
      
      if (!matchSnap.exists()) {
        showToast("Jogo não encontrado.");
        setLoading(false);
        return;
      }

      const matchData = matchSnap.data();

      // 1. SE O JOGO ESTAVA FINALIZADO, PRECISAMOS REVERTER OS PONTOS ANTES
      if (matchData.status === 'finished') {
        const guessesSnap = await getDocs(query(collection(db, 'guesses'), where('matchId', '==', matchId)));
        const memberUpdatesData = [];
        
        // Batch para deletar os palpites (limpeza de lixo)
        const batch = writeBatch(db);

        guessesSnap.forEach(guessDoc => {
          const guess = guessDoc.data();
          
          // Marca o palpite para exclusão
          batch.delete(guessDoc.ref);

          if (!guess.leagueId) return;

          const pointsToRemove = guess.pointsEarned || 0;
          
          // Prepara dados para remover pontos do membro
          if (pointsToRemove > 0) {
            memberUpdatesData.push({
              leagueId: guess.leagueId,
              userId: guess.userId,
              pointsToRemove,
              wasExact: pointsToRemove === 3
            });
          }
        });

        await queueExistingMemberUpdates(batch, memberUpdatesData, (data) => ({
            totalPoints: increment(-data.pointsToRemove),
            exactHits: increment(data.wasExact ? -1 : 0)
        }));

        batch.delete(matchRef);
        await batch.commit();
      } else {
        // Se não estava finalizado, apenas deleta os palpites associados para não deixar lixo
        const guessesSnap = await getDocs(query(collection(db, 'guesses'), where('matchId', '==', matchId)));
        const batch = writeBatch(db);
        guessesSnap.forEach(d => batch.delete(d.ref));
        batch.delete(matchRef);
        await batch.commit();
      }

      setMatches(prev => prev.filter(m => m.id !== matchId));
      showToast('Jogo excluído e ranking recalculado (se necessário).');

    } catch (error) {
      console.error(error);
      showToast('Erro ao excluir jogo.');
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteMatch = (match) => {
    // A mensagem agora é mais tranquila, pois o sistema cuida de tudo
    const warning = match.status === 'finished' 
      ? "Este jogo está FINALIZADO. Ao excluir, o sistema irá reverter automaticamente os pontos distribuídos e atualizar o ranking. Deseja continuar?"
      : "Tem certeza que deseja excluir este jogo e todos os palpites associados?";

    setModalConfig({
      isOpen: true,
      title: 'Excluir Jogo',
      message: warning,
      action: () => executeDeleteMatch(match.id),
      isDestructive: true 
    });
  };

  const filteredMatches = matches.filter(m => m.group === activeGroupResults);

  if (adminLoading) return <div className="container">Verificando acesso...</div>;
  if (!isAdmin) return <div className="container">Acesso negado.</div>;

  return (
    <div className="container">
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
                    {/* --- MUDANÇA 2: Mostrar data formatada em vez de "AGENDADO" --- */}
                    <div className="match-info" style={{marginTop: 0, marginBottom: '1rem', borderTop: 'none'}}>
                      {isFinished 
                        ? '✅ FINALIZADO' 
                        : `📅 ${new Date(m.date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                      }
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
                    <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '1.5rem', position: 'relative', minHeight: '40px'}}>
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
                          {isEditing && <button onClick={() => setEditingMatchId(null)} className="btn-secondary" style={{color: '#666'}}>Cancelar</button>}
                        </div>
                        {!isEditing && (
                          <button onClick={() => confirmDeleteMatch(m)} className="btn-delete-x" style={{position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)'}} title="Excluir Jogo">✕</button>
                        )}
                      </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {tab === 'matches' && (
        <div className="card-jogo">
          <div className="card-content">
            <h3 style={{marginBottom: '1rem'}}>Agendar Novo Jogo</h3>
            <form onSubmit={handleCreateMatch} className="admin-form">
              <div>
                <label className="form-label">Selecione o Grupo</label>
                <input className="form-input" placeholder="Ex: G" value={selectedGroupForMatch} maxLength={1}
                  onChange={e => {
                    setSelectedGroupForMatch(e.target.value.toUpperCase());
                    setMatchForm(prev => ({...prev, homeTeamId: '', awayTeamId: ''}));
                  }}
                />
              </div>
              <div style={{display: 'flex', gap: '1rem'}}>
                <div style={{flex: 1}}>
                    <label className="form-label">Time da Casa</label>
                    <select className="form-input" value={matchForm.homeTeamId} disabled={!selectedGroupForMatch} onChange={e => setMatchForm({...matchForm, homeTeamId: e.target.value})} required>
                    <option value="">Selecione...</option>
                    {availableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                </div>
                <div style={{flex: 1}}>
                    <label className="form-label">Time Visitante</label>
                    <select className="form-input" value={matchForm.awayTeamId} disabled={!selectedGroupForMatch} onChange={e => setMatchForm({...matchForm, awayTeamId: e.target.value})} required>
                    <option value="">Selecione...</option>
                    {availableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                </div>
              </div>
              <div><label className="form-label">Data e Hora</label><input type="datetime-local" className="form-input" value={matchForm.date} onChange={e => setMatchForm({...matchForm, date: e.target.value})} required /></div>
              <button className="login-btn" disabled={!selectedGroupForMatch}>Agendar Jogo</button>
            </form>
          </div>
        </div>
      )}

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
                    <label className="form-label">Grupo</label>
                    <input className="form-input" placeholder="A" maxLength={1} value={teamForm.group} onChange={e => setTeamForm({...teamForm, group: e.target.value.toUpperCase()})} />
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
                <div style={{fontSize: '0.8rem', color: 'var(--primary)', fontWeight:'bold'}}>Grupo {t.group || '?'}</div>
                <button onClick={() => handleEditTeamClick(t)} className="btn-secondary" style={{width: '100%', marginTop: '0.5rem', fontSize: '0.8rem'}}>Editar</button>
              </div>
            ))}
          </div>
        </>
      )}

      {toast && (
        <div className="toast-notification">
          ✅ {toast}
        </div>
      )}
    </div>
  );
}
