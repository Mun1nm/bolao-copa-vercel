import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebaseConfig';
import { useAuthState } from 'react-firebase-hooks/auth';

export default function InviteLink() {
  const { leagueId } = useParams();
  const [user, authLoading] = useAuthState(auth); // authLoading é importante para não redirecionar antes da hora
  const navigate = useNavigate();
  
  const [league, setLeague] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [joining, setJoining] = useState(false); // Estado para travar o botão durante o clique

  // --- MUDANÇA 1: Se não estiver logado, salva intenção e manda pro Login ---
  useEffect(() => {
    if (!authLoading && !user) {
      console.log("Usuário não logado. Salvando convite e redirecionando...");
      localStorage.setItem('pendingInvite', leagueId);
      navigate('/login');
    }
  }, [user, authLoading, leagueId, navigate]);

  // Carrega dados do Bolão
  useEffect(() => {
    const checkLeague = async () => {
      // Se ainda tá carregando auth ou não tem user, espera (o useEffect acima trata o redirect)
      if (authLoading || !user) return;

      try {
        const leagueDoc = await getDoc(doc(db, 'leagues', leagueId));
        
        if (!leagueDoc.exists()) {
          setErrorMsg("Este link de convite é inválido ou expirou.");
          setLoading(false);
          return;
        }

        setLeague(leagueDoc.data());

        // Verifica se já sou membro
        const memberDoc = await getDoc(doc(db, 'leagues', leagueId, 'members', user.uid));
        
        if (memberDoc.exists()) {
          const s = memberDoc.data().status;
          setStatus(s);
          
          // Se já for ativo, joga direto pro dashboard
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
  }, [leagueId, user, authLoading, navigate]);

  const handleJoinRequest = async () => {
    setJoining(true);
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
    } catch (error) {
      setErrorMsg("Erro ao enviar solicitação.");
    } finally {
      setJoining(false);
    }
  };

  // Carregamento inicial (Auth ou Dados)
  if (authLoading || (loading && !errorMsg)) {
    return <div className="container" style={{textAlign:'center', marginTop: 50}}>Carregando convite...</div>;
  }

  // Tela de Erro
  if (errorMsg) {
    return (
      <div className="container" style={{textAlign:'center', marginTop: 50}}>
        <h3 style={{color: '#ef4444'}}>Ocorreu um problema 😕</h3>
        <p>{errorMsg}</p>
        <button onClick={() => navigate('/')} className="btn-secondary" style={{marginTop: 20}}>Voltar para Home</button>
      </div>
    );
  }

  return (
    <div className="container" style={{display:'flex', justifyContent:'center', alignItems:'center', minHeight:'60vh'}}>
      {/* --- MUDANÇA 5: Layout Enriquecido --- */}
      <div className="card-jogo" style={{textAlign:'center', maxWidth:'500px', width: '100%', padding:'0'}}>
        <div className="card-content">
            <div style={{fontSize:'3rem', marginBottom:'0.5rem'}}>📩</div>
            <h2 style={{color: 'var(--primary)', marginBottom: '1.5rem'}}>Convite para Bolão</h2>
            
            <div style={{margin: '0 0 20px 0'}}>
                <p style={{color:'#666', fontSize:'0.9rem'}}>Você foi convidado para participar de:</p>
                <h1 style={{fontSize:'1.8rem', margin:'10px 0', color: 'var(--primary)'}}>{league?.name}</h1>
            </div>

            {/* --- BLOCO DE INFORMAÇÕES (Regras e Cota) --- */}
            <div style={{background: '#f8fafc', padding: '15px 20px', borderRadius: 10, margin: '20px 0', textAlign:'left', border: '1px solid #e2e8f0'}}>
              
              {/* Descrição / Regras */}
              {league?.rules ? (
                 <div style={{marginBottom: 15}}>
                   <span style={{fontSize:'0.75rem', fontWeight:'bold', color:'#94a3b8', textTransform:'uppercase'}}>Regras / Descrição</span>
                   <p style={{color: '#475569', fontSize: '0.95rem', margin: '5px 0', whiteSpace: 'pre-line', lineHeight: '1.5'}}>
                     {league.rules}
                   </p>
                 </div>
              ) : (
                <p style={{color: '#94a3b8', fontStyle: 'italic', fontSize: '0.9rem'}}>Sem descrição definida.</p>
              )}

              <hr style={{border: '0', borderTop: '1px solid #e2e8f0', margin: '15px 0'}}/>

              {/* Valor / Cota */}
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <span style={{fontWeight:'bold', color: '#475569'}}>Valor da Entrada:</span>
                <span style={{fontSize:'1.2rem', fontWeight:'bold', color: '#16a34a'}}>
                  {league?.entryFee ? `R$ ${league.entryFee}` : 'Grátis'}
                </span>
              </div>
            </div>

            {/* --- ESTADOS DO BOTÃO --- */}

            {status === 'pending' && (
              <div style={{background:'#fef9c3', padding:15, borderRadius:8, border:'1px solid #fde047', color:'#854d0e'}}>
                  <strong>Solicitação Enviada!</strong><br/>
                  Aguardando aprovação do gestor.
              </div>
            )}

            {status === 'none' && (
              <button onClick={handleJoinRequest} className="login-btn" disabled={joining}>
                  {joining ? 'Enviando...' : 'Aceitar e Participar'}
              </button>
            )}

            <button 
              onClick={() => navigate('/')} 
              style={{background:'transparent', border:'none', color:'#94a3b8', marginTop:15, cursor:'pointer', fontSize: '0.9rem'}}
            >
              Cancelar
            </button>
        </div>
      </div>
    </div>
  );
}