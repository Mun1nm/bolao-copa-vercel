import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../services/firebaseConfig';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import { useAdmin } from '../hooks/useAdmin';

export default function CreateLeague() {
  const [name, setName] = useState('');
  const [rules, setRules] = useState('');
  
  // MUDANÇA: entryFee começa como string vazia para não aparecer "0"
  const [entryFee, setEntryFee] = useState(''); 
  const [prizes, setPrizes] = useState([100]); 

  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();

  // --- LÓGICA DE DISTRIBUIÇÃO CORRIGIDA ---
  const handlePrizeChange = (index, value) => {
    // Permite limpar o campo (ficar vazio)
    if (value === '') {
      const newPrizes = [...prizes];
      newPrizes[index] = '';
      setPrizes(newPrizes);
      return;
    }

    // Remove zeros a esquerda (ex: "015" vira 15)
    const numberValue = parseInt(value, 10);
    
    // Evita NaN
    if (!isNaN(numberValue)) {
      const newPrizes = [...prizes];
      newPrizes[index] = numberValue;
      setPrizes(newPrizes);
    }
  };

  const addPrizeTier = () => {
    const currentTotal = prizes.reduce((a, b) => a + (Number(b) || 0), 0);
    if (currentTotal >= 100) {
      alert("A distribuição já atingiu 100%.");
      return;
    }
    // MUDANÇA: Adiciona vazio '' em vez de 0
    setPrizes([...prizes, '']); 
  };

  const removePrizeTier = (index) => {
    const newPrizes = prizes.filter((_, i) => i !== index);
    setPrizes(newPrizes);
  };

  // Calcula total tratando vazio como 0
  const totalPercentage = prizes.reduce((a, b) => a + (Number(b) || 0), 0);

  // --- SALVAR ---
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (entryFee && Number(entryFee) > 0) {
      if (totalPercentage !== 100) {
        alert(`A soma das porcentagens deve ser 100%. Atual: ${totalPercentage}%`);
        return;
      }
    }

    setLoading(true);
    try {
      const user = auth.currentUser;

      // Filtra prêmios vazios antes de salvar
      const finalPrizes = prizes.map(p => Number(p) || 0);

      const leagueRef = await addDoc(collection(db, 'leagues'), {
        name: name,
        rules: rules,
        ownerId: user.uid,
        createdAt: new Date(),
        entryFee: Number(entryFee) || 0,
        prizeDistribution: finalPrizes
      });

      await setDoc(doc(db, 'leagues', leagueRef.id, 'members', user.uid), {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
        email: user.email,
        status: 'active',
        joinedAt: new Date()
      });

      alert("Bolão criado com sucesso!");
      navigate('/'); 

    } catch (error) {
      console.error("Erro ao criar liga:", error);
      alert("Erro ao criar bolão.");
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin && !loading) return <div className="container">Acesso negado.</div>;

  return (
    <div className="container" style={{maxWidth: '600px'}}>
      <h2 style={{color: 'var(--primary)', marginBottom: '1.5rem'}}>Novo Bolão</h2>
      
      <div className="card-jogo">
        <div className="card-content">
          <form onSubmit={handleCreate} className="admin-form">
            <div>
              <label className="form-label">Nome do Bolão</label>
              <input className="form-input" placeholder="Ex: Bolão da Firma 2026" value={name} onChange={e => setName(e.target.value)} maxLength={30} required />
            </div>

            <div style={{marginTop: '1rem'}}>
              <label className="form-label">Regras Gerais (Opcional)</label>
              <textarea className="form-input" placeholder="Descreva critérios..." value={rules} onChange={e => setRules(e.target.value)} style={{minHeight: '80px', fontFamily: 'inherit'}} />
            </div>

            <hr style={{margin: '20px 0', borderColor: '#e5e7eb'}} />
            
            <h3 style={{fontSize: '1.1rem', marginBottom: '1rem', color: '#166534'}}>💰 Premiação</h3>
            
            <div style={{marginBottom: '1rem'}}>
              <label className="form-label">Cota de Entrada (R$)</label>
              <input 
                type="number" 
                className="form-input" 
                placeholder="0.00" // Placeholder ajuda a entender
                value={entryFee} 
                onChange={e => setEntryFee(e.target.value)} 
                onWheel={(e) => e.target.blur()} // MUDANÇA: Bloqueia scroll extra no React
              />
              <small style={{color: '#666'}}>Deixe vazio se for grátis.</small>
            </div>

            {(entryFee !== '' && Number(entryFee) > 0) && (
              <div style={{background: '#f0fdf4', padding: '15px', borderRadius: '8px', border: '1px solid #bbf7d0'}}>
                <label className="form-label" style={{color: '#166534'}}>Distribuição dos Prêmios (%)</label>
                
                {prizes.map((percent, index) => (
                  <div key={index} style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10}}>
                    <span style={{fontWeight: 'bold', width: '80px'}}>{index + 1}º Lugar:</span>
                    <input 
                      type="number" 
                      className="form-input" 
                      style={{width: '80px', margin: 0}}
                      placeholder="0"
                      value={percent}
                      onChange={(e) => handlePrizeChange(index, e.target.value)}
                      onWheel={(e) => e.target.blur()} // Bloqueia Scroll
                    />
                    <span style={{flex: 1}}>%</span>
                    
                    {prizes.length > 1 && (
                      <button type="button" onClick={() => removePrizeTier(index)} style={{color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem'}}>✕</button>
                    )}
                  </div>
                ))}

                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10}}>
                  <button type="button" onClick={addPrizeTier} className="btn-secondary" style={{fontSize: '0.9rem'}}>+ Adicionar Posição</button>
                  <div style={{fontWeight: 'bold', color: totalPercentage === 100 ? 'green' : 'red'}}>
                    Total: {totalPercentage}%
                  </div>
                </div>
              </div>
            )}
            
            <button className="login-btn" disabled={loading} style={{marginTop: '1.5rem'}}>
              {loading ? 'Criando...' : 'Criar Bolão'}
            </button>
            <button type="button" onClick={() => navigate('/')} className="btn-secondary" style={{marginTop: 10, width: '100%', border: 'none'}}>Cancelar</button>
          </form>
        </div>
      </div>
    </div>
  );
}