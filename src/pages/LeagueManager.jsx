import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '../services/firebaseConfig';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useLeagueGuard } from '../hooks/useLeagueGuard';

export default function LeagueManager() {
  const { leagueId } = useParams();

  useLeagueGuard(leagueId);

  const [user] = useAuthState(auth);
  const navigate = useNavigate();

  const [league, setLeague] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editingDeadline, setEditingDeadline] = useState(false);
  const [newDeadline, setNewDeadline] = useState('');
  const [savingDeadline, setSavingDeadline] = useState(false);

  // Estados para UI Customizada
  const [showToast, setShowToast] = useState(false); // "Link Copiado"
  const [modalConfig, setModalConfig] = useState({ 
    isOpen: false, 
    title: '', 
    message: '', 
    action: null, 
    isDestructive: false 
  });

  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      try {
        const leagueDoc = await getDoc(doc(db, 'leagues', leagueId));
        if (!leagueDoc.exists()) return navigate('/');
        
        const leagueData = leagueDoc.data();
        if (leagueData.ownerId !== user.uid) {
          navigate(`/bolao/${leagueId}`);
          return;
        }

        setLeague(leagueData);

        const membersSnap = await getDocs(collection(db, 'leagues', leagueId, 'members'));
        setMembers(membersSnap.docs.map(d => d.data()));

      } catch (error) {
        console.error("Erro", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [leagueId, user, navigate]);

  // --- FUNÇÕES REAIS ---
  const executeApprove = async (memberUid) => {
    await updateDoc(doc(db, 'leagues', leagueId, 'members', memberUid), { status: 'active' });
    setMembers(prev => prev.map(m => m.uid === memberUid ? {...m, status: 'active'} : m));
  };

  const executeRemove = async (memberUid) => {
    await deleteDoc(doc(db, 'leagues', leagueId, 'members', memberUid));
    setMembers(prev => prev.filter(m => m.uid !== memberUid));
  };

  // --- INTERAÇÕES COM O USUÁRIO ---
  const handleApproveClick = (uid) => {
    executeApprove(uid);
  };

  const handleRemoveClick = (uid, isReject = false) => {
    setModalConfig({
      isOpen: true,
      title: isReject ? 'Recusar Solicitação' : 'Remover Participante',
      message: isReject 
        ? 'Tem certeza que deseja recusar a entrada deste usuário?' 
        : 'Tem certeza que deseja remover este usuário do bolão? Ele perderá o acesso.',
      isDestructive: true,
      action: () => {
        executeRemove(uid);
        closeModal();
      }
    });
  };

  const formatDeadline = (deadlineTs) => {
    if (!deadlineTs) return null;
    return deadlineTs.toDate().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const toInputValue = (deadlineTs) => {
    if (!deadlineTs) return '2026-06-11T16:00';
    const d = deadlineTs.toDate();
    // Converter UTC para Brasília (UTC-3)
    const brasiliaOffset = -3 * 60;
    const local = new Date(d.getTime() + brasiliaOffset * 60000);
    return local.toISOString().slice(0, 16);
  };

  const handleSaveDeadline = async () => {
    if (!newDeadline) return;
    setSavingDeadline(true);
    try {
      const deadlineDate = new Date(newDeadline + ':00-03:00');
      const ts = Timestamp.fromDate(deadlineDate);
      await updateDoc(doc(db, 'leagues', leagueId), { deadline: ts });
      setLeague(prev => ({ ...prev, deadline: ts }));
      setEditingDeadline(false);
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar prazo.');
    } finally {
      setSavingDeadline(false);
    }
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}/convite/${leagueId}`;
    navigator.clipboard.writeText(link);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const closeModal = () => setModalConfig({ ...modalConfig, isOpen: false });

  if (loading) return <div className="container">Carregando gestão...</div>;

  const pendingMembers = members.filter(m => m.status === 'pending');
  const activeMembers = members.filter(m => m.status === 'active');

  // --- EXCLUIR O BOLÃO INTEIRO ---

  const executeDeleteLeague = async () => {
    try {
      // 1. Busca todos os membros desta liga
      const membersRef = collection(db, 'leagues', leagueId, 'members');
      const membersSnap = await getDocs(membersRef);

      // 2. Apaga um por um (Promise.all faz tudo ao mesmo tempo para ser rápido)
      // Isso é necessário para sumir da lista "Meus Bolões" dos usuários
      const deletePromises = membersSnap.docs.map((memberDoc) => 
        deleteDoc(memberDoc.ref)
      );
      
      await Promise.all(deletePromises);

      // (Opcional) Se você tiver uma subcoleção de 'palpites' dentro da liga, 
      // precisaria repetir o processo acima para ela também.

      // 3. Finalmente, apaga o documento PAI (A Liga em si)
      await deleteDoc(doc(db, 'leagues', leagueId));
      
      closeModal();
      navigate('/'); 
    } catch (error) {
      console.error("Erro ao excluir bolão:", error);
      alert("Erro ao excluir. Tente novamente.");
    }
  };

  const handleDeleteLeagueClick = () => {
    setModalConfig({
      isOpen: true,
      title: 'Excluir Bolão Permanentemente',
      message: 'PERIGO: Tem certeza absoluta que deseja excluir este bolão? Todos os palpites, ranking e participantes serão removidos. Essa ação NÃO pode ser desfeita.',
      action: executeDeleteLeague,
      isDestructive: true // Isso já deixa o botão do modal vermelho
    });
  };

  return (
    <div className="container">
      {/* --- TOAST NOTIFICATION --- */}
      {showToast && <div className="toast-notification">🔗 Link copiado para a área de transferência!</div>}

      {/* --- MODAL CUSTOMIZADO --- */}
      {modalConfig.isOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{modalConfig.title}</div>
            <p className="modal-text">{modalConfig.message}</p>
            <div className="modal-actions">
              <button onClick={closeModal} className="btn-secondary" style={{border:'none'}}>Cancelar</button>
              <button 
                onClick={modalConfig.action} 
                className={`btn-sm ${modalConfig.isDestructive ? 'btn-danger' : 'btn-success'}`}
                style={{padding: '0.6rem 1.2rem'}}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTEÚDO DA PÁGINA */}
      <div style={{borderBottom: '1px solid #e5e7eb', marginBottom: 20, paddingBottom: 10}}>
        <small style={{color: '#666', textTransform: 'uppercase'}}>Área do Gestor</small>
        <h2 style={{color: 'var(--primary)', margin: 0}}>{league?.name}</h2>
      </div>

      <div className="card-jogo" style={{marginBottom: '2rem'}}>
        <div className="card-content" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10}}>
          <div>
            <h4 style={{marginBottom: 5}}>🔗 Link de Convite</h4>
            <p style={{fontSize: '0.9rem', color: '#666', margin: 0}}>Compartilhe este link para as pessoas entrarem.</p>
          </div>
          <button onClick={copyInviteLink} className="btn-sm" style={{background:'#3b82f6', color:'white'}}>Copiar Link</button>
        </div>
      </div>

      <div className="card-jogo" style={{marginBottom: '2rem'}}>
        <div className="card-content">
          <h4 style={{marginBottom: 8}}>Prazo para Palpites</h4>
          {!editingDeadline ? (
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10}}>
              <div>
                {league?.deadline
                  ? <span style={{color: '#15803d', fontWeight: 600}}>{formatDeadline(league.deadline)}</span>
                  : <span style={{color: '#666'}}>Nenhum prazo definido</span>
                }
                <p style={{fontSize: '0.85rem', color: '#666', margin: '4px 0 0 0'}}>Horário de Brasília (UTC-3)</p>
              </div>
              <button
                onClick={() => { setNewDeadline(toInputValue(league?.deadline)); setEditingDeadline(true); }}
                className="btn-sm"
                style={{background: '#3b82f6', color: 'white'}}
              >
                {league?.deadline ? 'Editar' : 'Definir'}
              </button>
            </div>
          ) : (
            <div>
              <input
                type="datetime-local"
                className="form-input"
                value={newDeadline}
                onChange={e => setNewDeadline(e.target.value)}
                style={{marginBottom: 10}}
              />
              <small style={{display: 'block', color: '#666', marginBottom: 10}}>Horário de Brasília (UTC-3)</small>
              <div style={{display: 'flex', gap: 8}}>
                <button onClick={handleSaveDeadline} disabled={savingDeadline} className="btn-sm" style={{background: '#16a34a', color: 'white'}}>
                  {savingDeadline ? 'Salvando...' : 'Salvar'}
                </button>
                <button onClick={() => setEditingDeadline(false)} className="btn-sm btn-secondary" style={{border: 'none'}}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {pendingMembers.length > 0 && (
        <div style={{marginBottom: '2rem'}}>
          <h3 style={{color: '#d97706', marginBottom: '1rem'}}>⏳ Solicitações Pendentes</h3>
          <div className="matches-grid">
            {pendingMembers.map(member => (
              <div key={member.uid} className="card-jogo">
                <div className="card-content" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10}}>
                  
                  {/* LADO ESQUERDO: Avatar + Nome (com truncate) */}
                  <div style={{display:'flex', alignItems:'center', gap: 10, flex: 1, minWidth: 0}}>
                    {member.photoURL && <img 
                                          src={member.photoURL} 
                                          alt="Avatar"
                                          referrerPolicy="no-referrer"  // <--- ADICIONE ESTA LINHA
                                          className="user-avatar"       // (ou o seu style inline se tiver usando)
                                        />}
                    
                    <div style={{display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1}}>
                       <strong className="text-truncate" title={member.displayName}>
                         {member.displayName}
                       </strong>
                    </div>
                  </div>

                  {/* LADO DIREITO: Botões (não encolhem) */}
                  <div style={{display:'flex', gap: 8, flexShrink: 0}}>
                    <button onClick={() => handleApproveClick(member.uid)} className="btn-sm btn-success">✓ Aceitar</button>
                    <button onClick={() => handleRemoveClick(member.uid, true)} className="btn-sm btn-danger-outline">✕ Recusar</button>
                  </div>

                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 style={{color: '#166534', marginBottom: '1rem'}}>✅ Participantes Ativos ({activeMembers.length})</h3>
        <div className="matches-grid">
          {activeMembers.map(member => (
            <div key={member.uid} className="card-jogo">
              <div className="card-content" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10}}>
                
                {/* LADO ESQUERDO: Avatar + Nome + Badge */}
                <div style={{display:'flex', alignItems:'center', gap: 10, flex: 1, minWidth: 0}}>
                  {member.photoURL && <img 
                                        src={member.photoURL} 
                                        alt="Avatar"
                                        referrerPolicy="no-referrer"  // <--- ADICIONE ESTA LINHA
                                        className="user-avatar"       // (ou o seu style inline se tiver usando)
                                      />}
                  
                  <div style={{display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1}}>
                    <strong className="text-truncate" title={member.displayName}>
                      {member.displayName}
                    </strong>
                    {/* Badge fica embaixo do nome */}
                    {member.uid === league.ownerId && <span style={{fontSize: '0.7rem', color: 'var(--primary)'}}>👑 Gestor</span>}
                  </div>
                </div>
                
                {/* LADO DIREITO: Botão Remover */}
                {member.uid !== league.ownerId && (
                  <div style={{flexShrink: 0}}>
                     <button onClick={() => handleRemoveClick(member.uid)} className="btn-sm btn-danger-outline">Remover</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    {/* ... (código anterior da lista de participantes) ... */}

      {/* --- ZONA DE PERIGO --- */}
      <div style={{marginTop: '3rem', borderTop: '1px solid #e5e7eb', paddingTop: '2rem'}}>
        <h3 style={{color: '#ef4444', marginBottom: '1rem'}}>🚫 Zona de Perigo</h3>
        
        <div className="card-jogo" style={{borderColor: '#fca5a5', background: '#fef2f2'}}>
          <div className="card-content" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 15}}>
            
            <div>
              <strong style={{color: '#991b1b'}}>Excluir este bolão</strong>
              <p style={{margin: '5px 0 0 0', fontSize: '0.9rem', color: '#b91c1c'}}>
                Uma vez excluído, não há volta. Por favor, tenha certeza.
              </p>
            </div>

            <button 
              onClick={handleDeleteLeagueClick} 
              className="btn-sm"
              style={{
                backgroundColor: '#ef4444', 
                color: 'white', 
                padding: '0.8rem 1.2rem',
                fontSize: '0.9rem',
                border: '1px solid #dc2626'
              }}
            >
              Excluir Bolão
            </button>

          </div>
        </div>
      </div>

    </div> // Fim do container
  );
}