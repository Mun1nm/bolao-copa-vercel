import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider, db } from '../services/firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();

  const handleLogin = async () => {
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
        <button onClick={handleLogin} className="login-btn">
          Entrar com Google
        </button>
      </div>
    </div>
  );
}