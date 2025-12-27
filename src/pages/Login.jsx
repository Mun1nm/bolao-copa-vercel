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
      
      await setDoc(doc(db, 'users', user.uid), {
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        lastLogin: new Date()
      }, { merge: true });

      navigate('/');
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