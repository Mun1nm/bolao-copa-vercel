import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from './services/firebaseConfig';
import Navbar from './components/Navbar';

// Páginas
import Login from './pages/Login';
import Home from './pages/Home'; // Nova Home
import CreateLeague from './pages/CreateLeague'; // Nova Criação
import Dashboard from './pages/Dashboard'; // O antigo dashboard (vamos renomear a rota dele)
import Ranking from './pages/Ranking';
import Results from './pages/Results';
import Admin from './pages/Admin';
import InviteLink from './pages/InviteLink'; // A página de convite que você pediu (se já tiver criado o arquivo)
import LeagueManager from './pages/LeagueManager';

const PrivateRoute = ({ children }) => {
  const [user, loading] = useAuthState(auth);
  if (loading) return <div style={{textAlign:'center', marginTop:50}}>Carregando...</div>;
  if (!user) return <Navigate to="/login" />;
  return (
    <>
      <Navbar />
      {children}
    </>
  );
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Home: Lista meus bolões */}
        <Route path="/" element={<PrivateRoute><Home /></PrivateRoute>} />

        {/* Criação de Bolão */}
        <Route path="/criar-bolao" element={<PrivateRoute><CreateLeague /></PrivateRoute>} />

        {/* Convite (Crie o arquivo InviteLink.jsx com o código que passei na msg anterior se quiser testar já) */}
        <Route path="/convite/:leagueId" element={<PrivateRoute><InviteLink /></PrivateRoute>} />

        {/* DENTRO DO BOLÃO (Rotas com ID dinâmico) */}
        {/* Dashboard agora é específico da liga */}
        <Route path="/bolao/:leagueId" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        
        {/* O Ranking também será específico da liga (vamos ajustar isso no prox passo) */}
        <Route path="/bolao/:leagueId/ranking" element={<PrivateRoute><Ranking /></PrivateRoute>} />

        {/* Global Tools */}
        <Route path="/bolao/:leagueId/results" element={<PrivateRoute><Results /></PrivateRoute>} />        
        <Route path="/admin" element={<PrivateRoute><Admin /></PrivateRoute>} />
        
        {/* League Manager */}
        <Route path="/bolao/:leagueId/manage" element={ <PrivateRoute><LeagueManager /></PrivateRoute>} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;