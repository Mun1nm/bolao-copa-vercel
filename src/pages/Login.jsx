import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider, db } from '../services/firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

const getLoginErrorMessage = (error) => {
  if (error?.code === 'auth/unauthorized-domain') {
    return 'Este domínio não está autorizado no Firebase. Use http://localhost:5173/ ou adicione o domínio atual em Authentication > Settings > Authorized domains.';
  }

  if (error?.code === 'auth/popup-closed-by-user') {
    return 'O popup de login foi fechado antes de concluir. Tente novamente e escolha sua conta Google.';
  }

  if (error?.code === 'auth/popup-blocked') {
    return 'O navegador bloqueou o popup. Libere popups para este site e tente novamente.';
  }

  return `Não foi possível fazer login${error?.code ? ` (${error.code})` : ''}.`;
};

export default function Login() {
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setErrorMsg('');
    setLoading(true);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Salva ou atualiza usuário no banco
      await setDoc(doc(db, 'users', user.uid), {
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        lastLogin: new Date()
      }, { merge: true });

      // --- A MÁGICA DO REDIRECIONAMENTO AQUI ---
      
      // 1. Verifica se tem algum convite salvo na memória
      const pendingLeagueId = localStorage.getItem('pendingInvite');

      if (pendingLeagueId) {
        // 2. Se tiver, limpa a memória (pra não ficar preso nisso pra sempre)
        localStorage.removeItem('pendingInvite');
        
        // 3. Redireciona de volta para a tela de convite
        navigate(`/convite/${pendingLeagueId}`);
      } else {
        // 4. Se não tiver nada pendente, vida normal: vai pra Home
        navigate('/');
      }
      // -------------------------------------------

    } catch (error) {
      console.error("Erro login", error);
      setErrorMsg(getLoginErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 style={{ marginBottom: '1rem', fontSize: '2rem' }}>⚽</h1>
        <h2 style={{ marginBottom: '0.5rem' }}>Bolão da Copa</h2>
        <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
          Faça seus palpites e dispute com amigos!
        </p>
        {errorMsg && (
          <p style={{ color: '#b91c1c', background: '#fee2e2', padding: '0.75rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.9rem' }}>
            {errorMsg}
          </p>
        )}
        <button onClick={handleLogin} className="login-btn" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar com Google'}
        </button>
      </div>
    </div>
  );
}
