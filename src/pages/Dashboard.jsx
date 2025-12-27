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

  useEffect(() => {
    const loadData = async () => {
      if (leagueId) {
        const leagueDoc = await getDoc(doc(db, 'leagues', leagueId));
        if (leagueDoc.exists()) setLeagueData(leagueDoc.data());
      }

      const cachedTeams = localStorage.getItem('worldcup_teams_cache');
      let teamsMap = {};

      if (cachedTeams) {
        // Se já tem no navegador, usa o cache!
        teamsMap = JSON.parse(cachedTeams);
        setTeams(teamsMap);
      } else {
        // Se não tem, busca no Firebase e salva
        const teamsSnap = await getDocs(collection(db, 'teams'));
        teamsSnap.forEach(t => teamsMap[t.id] = { id: t.id, ...t.data() });
        
        setTeams(teamsMap);
        localStorage.setItem('worldcup_teams_cache', JSON.stringify(teamsMap));
      }

      const matchesSnap = await getDocs(collection(db, 'matches'));
      const matchList = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => new Date(a.date) - new Date(b.date));
      setMatches(matchList);

      const groups = [...new Set(matchList.map(m => m.group))].sort();
      setUniqueGroups(groups);
      if (groups.length > 0) setActiveGroup(groups[0]);

      // --- MUDANÇA 1: BUSCAR PALPITES DESTE BOLÃO ESPECÍFICO ---
      if (auth.currentUser) {
        // Query composta: Palpites deste usuário NESTE bolão
        const q = query(
          collection(db, 'guesses'), 
          where('userId', '==', auth.currentUser.uid),
          where('leagueId', '==', leagueId) // <--- O FILTRO MÁGICO
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
  }, [leagueId]);

  const getGuessStatus = (match, guess) => {
    if (!guess) return { type: 'wrong', label: 'Não palpitou', points: 0 };
    const mH = match.homeScore; const mA = match.awayScore;
    const gH = guess.homeGuess; const gA = guess.awayGuess;
    
    // Pontos agora são lidos do palpite, pois podem variar por bolão se as regras forem diferentes no futuro
    // Mas por enquanto usamos a lógica padrão para exibir o label
    if (guess.pointsEarned === 3) return { type: 'exact', label: 'Na Mosca!', points: 3 };
    if (guess.pointsEarned === 1) return { type: 'partial', label: 'Acertou Vencedor', points: 1 };
    
    // Fallback visual caso o admin ainda não tenha processado
    if (mH === gH && mA === gA) return { type: 'exact', label: 'Na Mosca!', points: 3 };
    const matchWinner = mH > mA ? 'home' : (mH < mA ? 'away' : 'draw');
    const guessWinner = gH > gA ? 'home' : (gH < gA ? 'away' : 'draw');
    if (matchWinner === guessWinner) return { type: 'partial', label: 'Acertou Vencedor', points: 1 };

    return { type: 'wrong', label: 'Errou', points: 0 };
  };

  const handleType = (matchId, field, value) => {
    setPendingGuesses(prev => ({ ...prev, [matchId]: { ...prev[matchId], [field]: value } }));
  };

  const handleSaveGuess = async (matchId) => {
    const userId = auth.currentUser.uid;
    
    // --- MUDANÇA 2: ID DO DOCUMENTO AGORA INCLUI O LEAGUEID ---
    // Antes: matchId_userId
    // Agora: leagueId_matchId_userId
    const guessId = `${leagueId}_${matchId}_${userId}`;
    
    const currentPending = pendingGuesses[matchId] || {};
    const currentSaved = myGuesses[matchId] || {};
    const homeVal = currentPending.homeGuess ?? currentSaved.homeGuess;
    const awayVal = currentPending.awayGuess ?? currentSaved.awayGuess;

    if (homeVal === undefined || awayVal === undefined || homeVal === '' || awayVal === '') {
      alert("Preencha tudo!"); return;
    }
    setLoadingIds(prev => [...prev, matchId]);
    
    try {
      const payload = { 
        matchId, 
        userId, 
        leagueId, // <--- SALVANDO O VÍNCULO COM O BOLÃO
        homeGuess: Number(homeVal), 
        awayGuess: Number(awayVal), 
        updatedAt: new Date() 
      };
      
      await setDoc(doc(db, 'guesses', guessId), payload, { merge: true });
      
      setMyGuesses(prev => ({ ...prev, [matchId]: { ...prev[matchId], ...payload } }));
      setPendingGuesses(prev => { const newState = { ...prev }; delete newState[matchId]; return newState; });
    
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
                        <input type="number" className="score-input" value={homeValue} onChange={(e) => handleType(match.id, 'homeGuess', e.target.value)} placeholder="0"/>
                        <span>×</span>
                        <input type="number" className="score-input" value={awayValue} onChange={(e) => handleType(match.id, 'awayGuess', e.target.value)} placeholder="0"/>
                      </>
                    )}
                  </div>
                  <div className="team-box"><img src={away.flagUrl} alt={away.name}/><span>{away.id}</span></div>
                </div>
                {!isFinished && <div className="match-info">{new Date(match.date).toLocaleDateString('pt-BR')}</div>}
                {!isFinished && hasChanges && <button onClick={() => handleSaveGuess(match.id)} className="btn-save-guess" disabled={isSaving}>Confirmar</button>}
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
    </div>
  );
}