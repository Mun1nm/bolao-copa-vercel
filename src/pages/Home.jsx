import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collectionGroup, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebaseConfig';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useAdmin } from '../hooks/useAdmin';

export default function Home() {
  const navigate = useNavigate();
  const [user] = useAuthState(auth);
  const { isAdmin } = useAdmin();
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verifica se existe um convite pendente guardado
    const pendingInvite = localStorage.getItem('pendingInvite');

    if (pendingInvite) {
      console.log("Convite pendente encontrado! Redirecionando...");
      
      // 1. Limpa o storage para não entrar em loop infinito
      localStorage.removeItem('pendingInvite');
      
      // 2. Manda o usuário de volta para a tela do convite
      navigate(`/convite/${pendingInvite}`);
    }
  }, [navigate]);

  useEffect(() => {
    const fetchMyLeagues = async () => {
      if (!user) return;

      try {
        // Busca em TODAS as subcoleções 'members' onde o ID do documento é igual ao meu UID
        // Truque: O ID do documento em 'members' é o próprio UID do usuário
        // Porém, collectionGroup busca por CAMPOS.
        // Então vamos buscar onde o campo 'uid' == user.uid (que salvamos no passo anterior)
        
        const membersQuery = query(
          collectionGroup(db, 'members'),
          where('uid', '==', user.uid)
        );

        const querySnapshot = await getDocs(membersQuery);
        
        const leaguesList = [];
        
        // Para cada resultado (membro), precisamos buscar o nome da Liga (o documento Pai)
        for (const memberDoc of querySnapshot.docs) {
          const leagueRef = memberDoc.ref.parent.parent; // members -> leagues/ID
          if (leagueRef) {
            const leagueSnap = await getDoc(leagueRef);
            if (leagueSnap.exists()) {
              leaguesList.push({
                id: leagueSnap.id,
                ...leagueSnap.data(),
                myStatus: memberDoc.data().status // Para saber se estou pendente ou ativo
              });
            }
          }
        }

        setLeagues(leaguesList);
      } catch (error) {
        console.error("Erro ao buscar ligas:", error);
        // Se der erro de índice, vamos ver no console
      } finally {
        setLoading(false);
      }
    };

    fetchMyLeagues();
  }, [user]);

  if (loading) return <div className="container">Carregando seus bolões...</div>;

  return (
    <div className="container">
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem'}}>
        <h2 style={{color: 'var(--primary)', margin: 0}}>Meus Bolões</h2>
        
        {/* 3. CONDICIONAL AQUI: Só mostra o botão se for Admin */}
        {isAdmin && (
          <Link to="/criar-bolao" className="login-btn" style={{width: 'auto', margin: 0, padding: '0.5rem 1rem'}}>
            + Novo
          </Link>
        )}
      </div>

      {leagues.length === 0 ? (
        <div style={{textAlign: 'center', color: '#666', marginTop: '3rem'}}>
          <h3>Você ainda não participa de nenhum bolão.</h3>
          <p>Peça um link de convite para seu gestor!</p> {/* Texto atualizado */}
        </div>
      ) : (
        <div className="matches-grid">
          {leagues.map(league => (
            <div key={league.id} className="card-jogo" style={{cursor: 'pointer'}}>
               <Link to={`/bolao/${league.id}`} style={{textDecoration: 'none', color: 'inherit'}}>
                <div className="card-content" style={{textAlign: 'center'}}>
                  <h3 style={{fontSize: '1.2rem', marginBottom: '0.5rem'}}>{league.name}</h3>
                  
                  {league.myStatus === 'active' ? (
                     <span className="badge-finished" style={{background: '#dcfce7', color: '#166534'}}>Participando</span>
                  ) : (
                     <span className="badge-finished" style={{background: '#fef9c3', color: '#854d0e'}}>Pendente</span>
                  )}

                  {league.ownerId === user.uid && (
                    <span style={{display:'block', fontSize: '0.75rem', marginTop: 10, color: 'var(--primary)'}}>👑 Você é o Gestor</span>
                  )}
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}