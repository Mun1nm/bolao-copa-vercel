import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebaseConfig';
import { useParams } from 'react-router-dom';
import { useLeagueGuard } from '../hooks/useLeagueGuard';

export default function Ranking() {
  const { leagueId } = useParams();
  useLeagueGuard(leagueId);

  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leagueData, setLeagueData] = useState(null);

  useEffect(() => {
    const fetchRanking = async () => {
      try {
        // 1. Dados do Bolão (1 Leitura)
        const leagueDoc = await getDoc(doc(db, 'leagues', leagueId));
        if (leagueDoc.exists()) setLeagueData(leagueDoc.data());

        // 2. Buscar Membros (N leituras, onde N é o nº de membros)
        const membersRef = collection(db, 'leagues', leagueId, 'members');
        const membersQ = query(membersRef, where('status', '==', 'active'));
        const membersSnap = await getDocs(membersQ);

        // --- MUDANÇA: NÃO BUSCAMOS MAIS A COLEÇÃO 'USERS' ---
        // Usamos diretamente os dados (foto/nome) que estão gravados no membro
        
        let membersList = membersSnap.docs.map(d => ({ 
            id: d.data().uid, 
            ...d.data() 
        }));

        if (membersList.length === 0) {
          setRanking([]); setLoading(false); return;
        }

        // 3. Ordenar
        membersList.sort((a, b) => {
            if ((b.totalPoints || 0) !== (a.totalPoints || 0)) {
                return (b.totalPoints || 0) - (a.totalPoints || 0);
            }
            return (b.exactHits || 0) - (a.exactHits || 0);
        });

        setRanking(membersList);
      } catch (error) {
        console.error("Erro ao carregar ranking:", error);
      } finally {
        setLoading(false);
      }
    };

    if (leagueId) fetchRanking();
  }, [leagueId]);

  // --- CÁLCULO FINANCEIRO ---
  const entryFee = leagueData?.entryFee || 0;
  const totalPool = entryFee * ranking.length;
  const prizes = leagueData?.prizeDistribution || [];
  const formatBRL = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  if (loading) return <div className="container">Carregando classificação...</div>;

  return (
    <div className="container">
      <div style={{marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'end', flexWrap: 'wrap', gap: 10}}>
        <div>
          <small style={{color: '#666', textTransform: 'uppercase'}}>Classificação</small>
          <h2 style={{color: 'var(--primary)', margin: 0}}>{leagueData?.name}</h2>
        </div>
        
        {entryFee > 0 && (
          <div style={{background: '#dcfce7', padding: '10px 15px', borderRadius: '8px', color: '#166534', border: '1px solid #86efac'}}>
            <small style={{display: 'block', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase'}}>Prêmio Total</small>
            <span style={{fontSize: '1.2rem', fontWeight: 'bold'}}>{formatBRL(totalPool)}</span>
          </div>
        )}
      </div>
      
      <table className="ranking-table" style={{ tableLayout: 'fixed', width: '100%' }}>
        <thead>
          <tr>
            <th style={{width: '45px'}}>#</th>
            <th style={{textAlign: 'left'}}>Apostador</th>
            <th style={{width: '50px', textAlign: 'center'}}>Pts</th>
            <th style={{width: '50px', textAlign: 'center'}}>🎯</th>
            {entryFee > 0 && <th style={{width: '100px', textAlign: 'right', paddingRight: '15px'}}>Prêmio</th>}
          </tr>
        </thead>
        <tbody>
          {ranking.map((user, index) => {
            const prizePercent = prizes[index] || 0; 
            const prizeValue = prizePercent > 0 ? (totalPool * prizePercent / 100) : 0;

            return (
              <tr key={user.id} className={`rank-${index + 1}`}>
                <td className="rank-position">{index + 1}º</td>
                
                <td style={{ overflow: 'hidden' }}>
                  <div className="user-cell">
                    {user.photoURL && <img 
                                        src={user.photoURL} 
                                        alt="Avatar"
                                        referrerPolicy="no-referrer"  // <--- ADICIONE ESTA LINHA
                                        className="user-avatar"       // (ou o seu style inline se tiver usando)
                                      />}
                    <span 
                      className="text-truncate" 
                      title={user.displayName}
                      style={{
                        fontWeight: user.id === auth?.currentUser?.uid ? 'bold' : 'normal',
                        flex: 1, minWidth: 0
                      }}
                    >
                      {user.displayName}
                      {user.id === auth?.currentUser?.uid && ' (Você)'}
                    </span>
                  </div>
                </td>
                
                {/* Aqui usamos os pontos do membro, não do user global */}
                <td style={{textAlign: 'center', fontWeight: 'bold', fontSize: '1.1rem'}}>{user.totalPoints || 0}</td>
                <td style={{textAlign: 'center', color: '#6b7280'}}>{user.exactHits || 0}</td>
                
                {entryFee > 0 && (
                  <td style={{
                    textAlign: 'right', 
                    fontWeight: prizeValue > 0 ? 'bold' : 'normal', 
                    color: prizeValue > 0 ? '#166534' : '#9ca3af', 
                    fontSize: '0.9rem',
                    paddingRight: '15px'
                  }}>
                    {prizeValue > 0 ? formatBRL(prizeValue) : '-'}
                  </td>
                )}
              </tr>
            );
          })}
          {ranking.length === 0 && (
            <tr><td colSpan={entryFee > 0 ? 5 : 4} style={{textAlign:'center', padding: 20}}>Nenhum membro pontuou ainda.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}