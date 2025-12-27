import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../services/firebaseConfig';
import { useAuthState } from 'react-firebase-hooks/auth';

export const useLeagueGuard = (leagueId) => {
  const navigate = useNavigate();
  const [user, loading] = useAuthState(auth);

  useEffect(() => {
    // Se ainda está carregando o usuario ou não tem ID do bolão, espera.
    if (loading || !user || !leagueId) return;

    // --- VIGILÂNCIA EM TEMPO REAL ---
    // O onSnapshot "escuta" mudanças no banco.
    // Se o gestor deletar o membro, essa função roda na hora na tela do usuário.
    const memberRef = doc(db, 'leagues', leagueId, 'members', user.uid);

    const unsubscribe = onSnapshot(memberRef, (docSnap) => {
      // 1. Se o documento não existe mais (foi excluído)
      // 2. Ou se o status deixou de ser 'active' (ex: virou pending ou banned)
      if (!docSnap.exists() || docSnap.data().status !== 'active') {
        // Redireciona imediatamente para a Home
        navigate('/');
      }
    }, (error) => {
      console.error("Erro na verificação de membro:", error);
      // Se der erro de permissão (ex: regras de segurança bloquearam leitura pq foi expulso)
      // também chuta pra home
      navigate('/');
    });

    // Limpa o ouvinte quando sair da página
    return () => unsubscribe();
  }, [leagueId, user, loading, navigate]);
};