import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebaseConfig';
import { useAuthState } from 'react-firebase-hooks/auth';

export default function InviteLink() {
  const { leagueId } = useParams();
  const [user] = useAuthState(auth);
  const navigate = useNavigate();
  
  const [league, setLeague] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [errorMsg, setErrorMsg] = useState(''); // Para substituir o alert de erro

  useEffect(() => {
    const checkLeague = async () => {
      if (!user) return;

      try {
        const leagueDoc = await getDoc(doc(db, 'leagues', leagueId));
        
        if (!leagueDoc.exists()) {
          setErrorMsg("Este link de convite é inválido ou expirou.");
          setLoading(false);
          return;
        }

        setLeague(leagueDoc.data());

        const memberDoc = await getDoc(doc(db, 'leagues', leagueId, 'members', user.uid));
        
        if (memberDoc.exists()) {
          const s = memberDoc.data().status;
          setStatus(s);
          
          // --- MUDANÇA 1: REDIRECIONAMENTO AUTOMÁTICO ---
          if (s === 'active') {
            navigate(`/bolao/${leagueId}`, { replace: true });
          }
        } else {
          setStatus('none');
        }

      } catch (error) {
        console.error("Erro", error);
        setErrorMsg("Erro ao carregar convite.");
      } finally {
        setLoading(false);
      }
    };

    checkLeague();
  }, [leagueId, user, navigate]);

  const handleJoinRequest = async () => {
    try {
      await setDoc(doc(db, 'leagues', leagueId, 'members', user.uid), {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
        email: user.email,
        status: 'pending',
        joinedAt: new Date()
      });
      setStatus('pending');
      // Não precisa de alert, a UI muda sozinha para "Aguardando aprovação"
    } catch (error) {
      setErrorMsg("Erro ao enviar solicitação.");
    }
  };

  if (loading) return <div className="container" style={{textAlign:'center', marginTop: 50}}>Carregando convite...</div>;

  // Se tiver erro (link inválido), mostra na tela bonitinho
  if (errorMsg) {
    return (
      <div className="container" style={{textAlign:'center', marginTop: 50}}>
        <h3 style={{color: '#ef4444'}}>Ocorreu um problema 😕</h3>
        <p>{errorMsg}</p>
        <button onClick={() => navigate('/')} className="btn-secondary" style={{marginTop: 20}}>Voltar para Home</button>
      </div>
    );
  }

  // Se o redirecionamento automático não acontecer (ex: delay), mostra isso,
  // mas idealmente o usuário 'active' nem vê essa tela.
  return (
    <div className="container" style={{display:'flex', justifyContent:'center', alignItems:'center', minHeight:'60vh'}}>
      <div className="card-jogo" style={{textAlign:'center', maxWidth:'400px', padding:'0'}}>
        <div className="card-content">
            <div style={{fontSize:'3rem', marginBottom:'1rem'}}>📩</div>
            <h2 style={{color: 'var(--primary)', marginBottom: '1rem'}}>Convite para Bolão</h2>
            
            <div style={{margin: '20px 0'}}>
                <p style={{color:'#666'}}>Você foi convidado para:</p>
                <h1 style={{fontSize:'1.8rem', margin:'10px 0', color: 'var(--primary)'}}>{league.name}</h1>
            </div>

            {status === 'pending' && (
              <div style={{background:'#fef9c3', padding:15, borderRadius:8, border:'1px solid #fde047', color:'#854d0e'}}>
                  <strong>Solicitação Enviada!</strong><br/>
                  Aguardando aprovação do gestor.
              </div>
            )}

            {status === 'none' && (
              <button onClick={handleJoinRequest} className="login-btn">
                  Solicitar Entrada
              </button>
            )}
        </div>
      </div>
    </div>
  );
}