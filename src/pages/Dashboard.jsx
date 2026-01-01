import { useEffect, useState } from 'react';
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

  // --- LÓGICA INTELIGENTE DE SALVAMENTO ---
  const handleSaveGuess = async (matchId) => {
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

    } catch (e) { console.error(e); alert("Erro ao salvar palpite"); } 
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
          const status = isFinished ? getGuessStatus(match, saved) : null;

          return (
            <div key={match.id} className="card-jogo">
              <div className="card-content">
                <div className="match-header">
                  <div className="team-box"><img src={home.flagUrl} alt={home.name}/><span>{home.id}</span></div>
                  <div className="score-box">
                    {isFinished ? (
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
                
                {!isFinished && hasChanges && (
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