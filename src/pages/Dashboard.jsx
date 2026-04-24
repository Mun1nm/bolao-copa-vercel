import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { collection, getDocs, doc, setDoc, getDoc, query, where } from 'firebase/firestore';
import { db, auth } from '../services/firebaseConfig';
import { useLeagueGuard } from '../hooks/useLeagueGuard';

export default function Dashboard() {
  const { leagueId } = useParams();
  useLeagueGuard(leagueId);

  const [leagueData, setLeagueData] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState({});
  const [myGuesses, setMyGuesses] = useState({});
  const [activeGroup, setActiveGroup] = useState('');
  const [uniqueGroups, setUniqueGroups] = useState([]);
  const [pendingGuesses, setPendingGuesses] = useState({});
  const [loadingIds, setLoadingIds] = useState([]);
  const [toast, setToast] = useState(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const loadData = async () => {
      // 1. Carrega dados do Bolão
      if (leagueId) {
        const leagueDoc = await getDoc(doc(db, 'leagues', leagueId));
        if (leagueDoc.exists()) setLeagueData(leagueDoc.data());
      }

      // 2. Carrega Times (SEMPRE atualizado do banco, sem cache)
      const teamsSnap = await getDocs(collection(db, 'teams'));
      const teamsMap = {};
      teamsSnap.forEach(t => teamsMap[t.id] = { id: t.id, ...t.data() });
      setTeams(teamsMap);

      // 3. Carrega Jogos
      const matchesSnap = await getDocs(collection(db, 'matches'));
      const matchList = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => new Date(a.date) - new Date(b.date));
      setMatches(matchList);

      // 4. Configura Grupos (Lógica original)
      const groups = [...new Set(matchList.map(m => m.group))].sort();
      setUniqueGroups(groups);
      
      // Seleciona o primeiro grupo da lista (ex: 'A') se houver grupos
      if (groups.length > 0) setActiveGroup(groups[0]);

      // 5. Carrega Palpites do Usuário
      if (auth.currentUser) {
        const q = query(
          collection(db, 'guesses'), 
          where('userId', '==', auth.currentUser.uid),
          where('leagueId', '==', leagueId)
        );
        
        const guessesSnap = await getDocs(q);
        const userGuesses = {};
        guessesSnap.forEach(g => {
           userGuesses[g.data().matchId] = g.data();
        });
        setMyGuesses(userGuesses);
      }
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  // Atualiza o relógio local a cada segundo (para countdown)
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [leagueId]);

  const getGuessStatus = (match, guess) => {
    if (!guess) return { type: 'wrong', label: 'Não palpitou', points: 0 };
    const mH = match.homeScore; const mA = match.awayScore;
    const gH = guess.homeGuess; const gA = guess.awayGuess;
    
    if (guess.pointsEarned === 3) return { type: 'exact', label: 'Na Mosca!', points: 3 };
    if (guess.pointsEarned === 1) return { type: 'partial', label: 'Acertou Vencedor', points: 1 };
    
    if (mH === gH && mA === gA) return { type: 'exact', label: 'Na Mosca!', points: 3 };
    const matchWinner = mH > mA ? 'home' : (mH < mA ? 'away' : 'draw');
    const guessWinner = gH > gA ? 'home' : (gH < gA ? 'away' : 'draw');
    if (matchWinner === guessWinner) return { type: 'partial', label: 'Acertou Vencedor', points: 1 };

    return { type: 'wrong', label: 'Errou', points: 0 };
  };

  const handleType = (matchId, field, value) => {
    setPendingGuesses(prev => ({ ...prev, [matchId]: { ...prev[matchId], [field]: value } }));
  };

  const deadlineDate = leagueData?.deadline?.toDate() || null;
  const isDeadlinePassed = deadlineDate ? now >= deadlineDate : false;

  const formatDeadline = () => {
    if (!deadlineDate) return '';
    return deadlineDate.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatCountdown = useCallback(() => {
    if (!deadlineDate) return null;
    const diff = deadlineDate - now;
    if (diff <= 0) return null;
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    const timeBlocks = [];
    if (days > 0) timeBlocks.push({ label: 'dias', value: days });
    timeBlocks.push({ label: 'horas', value: hours });
    timeBlocks.push({ label: 'min', value: minutes });
    if (days === 0) timeBlocks.push({ label: 'seg', value: seconds });

    return (
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {timeBlocks.map((block) => (
          <div key={block.label} style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            background: 'white', 
            padding: '6px 10px', 
            borderRadius: '8px', 
            minWidth: '50px', 
            boxShadow: '0 2px 4px rgba(22, 101, 52, 0.08)',
            border: '1px solid rgba(22, 101, 52, 0.1)'
          }}>
             <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#166534', lineHeight: '1', fontVariantNumeric: 'tabular-nums' }}>
               {String(block.value).padStart(2, '0')}
             </span>
             <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#15803d', fontWeight: '700', marginTop: '4px', letterSpacing: '0.5px' }}>
               {block.label}
             </span>
          </div>
        ))}
      </div>
    );
  }, [deadlineDate, now]);

  // --- LÓGICA INTELIGENTE DE SALVAMENTO ---
  const handleSaveGuess = async (matchId) => {
    if (isDeadlinePassed) {
      setToast("Prazo encerrado! Palpite não pode ser salvo.");
      setTimeout(() => setToast(null), 3000);
      return;
    }

    const userId = auth.currentUser.uid;
    const guessId = `${leagueId}_${matchId}_${userId}`;
    
    const currentPending = pendingGuesses[matchId] || {};
    const currentSaved = myGuesses[matchId] || {};

    // Pega o valor bruto (pode ser string vazia, numero ou undefined)
    let rawHome = currentPending.homeGuess !== undefined ? currentPending.homeGuess : currentSaved.homeGuess;
    let rawAway = currentPending.awayGuess !== undefined ? currentPending.awayGuess : currentSaved.awayGuess;

    // Normaliza para string para facilitar a checagem
    const strHome = rawHome === undefined || rawHome === null ? '' : String(rawHome);
    const strAway = rawAway === undefined || rawAway === null ? '' : String(rawAway);

    // 1. Se ambos estiverem vazios, o usuário não digitou nada. Aborta.
    if (strHome === '' && strAway === '') {
      return;
    }

    // 2. A MÁGICA: Se um estiver vazio, assume ZERO.
    const finalHome = strHome === '' ? 0 : parseInt(strHome);
    const finalAway = strAway === '' ? 0 : parseInt(strAway);

    setLoadingIds(prev => [...prev, matchId]);
    
    try {
      const payload = { 
        matchId, 
        userId, 
        leagueId,
        homeGuess: finalHome, 
        awayGuess: finalAway, 
        updatedAt: new Date() 
      };
      
      await setDoc(doc(db, 'guesses', guessId), payload, { merge: true });
      
      // Atualiza o estado local com os valores finais (ex: preenchendo o zero na tela)
      setMyGuesses(prev => ({ ...prev, [matchId]: { ...prev[matchId], ...payload } }));
      
      // Limpa o estado pendente
      setPendingGuesses(prev => { const newState = { ...prev }; delete newState[matchId]; return newState; });

      setToast("Palpite salvo!");
      setTimeout(() => setToast(null), 2000);

    } catch (e) {
      console.error(e);
      // Firestore Security Rules rejeitou — prazo encerrado no servidor
      if (e?.code === 'permission-denied') {
        setToast("⛔ Prazo encerrado! Palpite bloqueado pelo servidor.");
      } else {
        setToast("Erro ao salvar palpite.");
      }
      setTimeout(() => setToast(null), 3500);
    } 
    finally { setLoadingIds(prev => prev.filter(id => id !== matchId)); }
  };

  const filteredMatches = matches.filter(m => m.group === activeGroup);

  return (
    <div className="container">
      {showRules && (
        <div className="modal-overlay" onClick={() => setShowRules(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{maxWidth: '500px'}}>
            <div className="modal-title">📜 Regras do Bolão</div>
            <div className="modal-text" style={{whiteSpace: 'pre-wrap', maxHeight: '60vh', overflowY: 'auto'}}>
              {leagueData?.rules || "Este bolão não possui regras definidas."}
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowRules(false)} className="btn-secondary">Fechar</button>
            </div>
          </div>
        </div>
      )}

      <div style={{borderBottom: '1px solid #e5e7eb', marginBottom: 20, paddingBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'end'}}>
        <div>
            <small style={{color: '#666', textTransform: 'uppercase', letterSpacing: 1}}>Bolão</small>
            <h1 style={{color: 'var(--primary)', margin: 0}}>{leagueData?.name || '...'}</h1>
        </div>
        <button onClick={() => setShowRules(true)} className="btn-secondary" style={{border: 'none', background: 'transparent', fontSize: '1.5rem', padding: '0 10px'}} title="Ver Regras">ℹ️</button>
      </div>

      {deadlineDate && (
        <div style={{
          marginBottom: 24,
          background: isDeadlinePassed 
            ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)' 
            : 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
          borderRadius: 16,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)',
          border: `1px solid ${isDeadlinePassed ? '#fca5a5' : '#86efac'}`
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '1.2rem', filter: isDeadlinePassed ? 'grayscale(1)' : 'none' }}>{isDeadlinePassed ? '🔒' : '⏳'}</span>
              <h3 style={{ 
                margin: 0, 
                color: isDeadlinePassed ? '#991b1b' : '#166534', 
                fontSize: '1rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: 0.5
              }}>
                {isDeadlinePassed ? 'Prazo Encerrado' : 'Tempo Restante'}
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: isDeadlinePassed ? '#7f1d1d' : '#15803d', fontWeight: 500 }}>
              Fechamento: {formatDeadline()}
            </p>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', flex: '1 1 auto' }}>
            {!isDeadlinePassed ? (
               formatCountdown()
            ) : (
              <div style={{ background: 'white', padding: '10px 16px', borderRadius: '10px', boxShadow: '0 2px 4px rgba(185, 28, 28, 0.1)', border: '1px solid rgba(185, 28, 28, 0.2)' }}>
                <span style={{ fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase', fontSize: '0.9rem', letterSpacing: '1px' }}>
                  Palpites Bloqueados
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="groups-nav">
        {uniqueGroups.map(group => (
          <button key={group} className={`group-tab ${activeGroup === group ? 'active' : ''}`} onClick={() => setActiveGroup(group)}>
            Grupo {group}
          </button>
        ))}
      </div>
      
      <div className="matches-grid">
        {filteredMatches.map(match => {
          const home = teams[match.homeTeamId];
          const away = teams[match.awayTeamId];
          if (!home || !away) return null;

          const pending = pendingGuesses[match.id] || {};
          const saved = myGuesses[match.id] || {};
          
          // O valor do input agora aceita vazio '' sem placeholder
          const homeValue = pending.homeGuess ?? saved.homeGuess ?? '';
          const awayValue = pending.awayGuess ?? saved.awayGuess ?? '';
          
          const hasChanges = pendingGuesses[match.id] !== undefined;
          const isSaving = loadingIds.includes(match.id);
          const isFinished = match.status === 'finished';
          const isLocked = isFinished || isDeadlinePassed;
          const status = isFinished ? getGuessStatus(match, saved) : null;

          return (
            <div key={match.id} className="card-jogo">
              <div className="card-content">
                <div className="match-header">
                  <div className="team-box"><img src={home.flagUrl} alt={home.name}/><span>{home.id}</span></div>
                  <div className="score-box">
                    {isLocked ? (
                      <span style={{fontSize: '1.5rem', color: '#333'}}>{saved.homeGuess ?? '-'} x {saved.awayGuess ?? '-'}</span>
                    ) : (
                      <>
                        {/* INPUT CASA */}
                        <input 
                          type="number" 
                          inputMode="numeric"
                          className="score-input" 
                          value={homeValue} 
                          onChange={(e) => handleType(match.id, 'homeGuess', e.target.value)} 
                          
                          // LÓGICA DO PLACEHOLDER DINÂMICO AQUI 👇
                          // Se o valor do visitante (awayValue) não for vazio, mostra "0" aqui
                          placeholder={String(awayValue) !== '' ? "0" : ""}
                        />
                        
                        <span>×</span>
                        
                        {/* INPUT VISITANTE */}
                        <input 
                          type="number" 
                          inputMode="numeric"
                          className="score-input" 
                          value={awayValue} 
                          onChange={(e) => handleType(match.id, 'awayGuess', e.target.value)} 
                          
                          // LÓGICA DO PLACEHOLDER DINÂMICO AQUI 👇
                          // Se o valor da casa (homeValue) não for vazio, mostra "0" aqui
                          placeholder={String(homeValue) !== '' ? "0" : ""}
                        />
                      </>
                    )}
                  </div>
                  <div className="team-box"><img src={away.flagUrl} alt={away.name}/><span>{away.id}</span></div>
                </div>
                
                {/* Resto do código igual... */}
                {!isFinished && <div className="match-info">{new Date(match.date).toLocaleDateString('pt-BR')}</div>}

                {!isLocked && hasChanges && (
                  <button onClick={() => handleSaveGuess(match.id)} className="btn-save-guess" disabled={isSaving}>
                    {isSaving ? '...' : 'Confirmar'}
                  </button>
                )}
              </div>
              {isFinished && (
                <div className="guess-feedback">
                  <div className={`result-badge status-${status.type}`}><span className="dot"></span>{status.label} (+{saved.pointsEarned || 0})</div>
                  <div className="official-score">Oficial: <strong>{match.homeScore} - {match.awayScore}</strong></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {toast && (
        <div className="toast-notification">
          ✅ {toast}
        </div>
      )}
    </div>
  );
}