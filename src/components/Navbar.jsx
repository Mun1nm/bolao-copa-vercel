import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { auth, db } from '../services/firebaseConfig';
import { doc, getDoc, collectionGroup, query, where, getDocs, writeBatch, setDoc } from 'firebase/firestore';
import { signOut, updateProfile } from 'firebase/auth';
import { useAdmin } from '../hooks/useAdmin';
import { useAuthState } from 'react-firebase-hooks/auth';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [user] = useAuthState(auth);
  
  const [isOpen, setIsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const dropdownRef = useRef(null);

  const { isAdmin: isGlobalAdmin } = useAdmin();
  const [isLeagueOwner, setIsLeagueOwner] = useState(false);
  const [activeLeagueId, setActiveLeagueId] = useState(null);

  // 1. Detecta Bolão
  useEffect(() => {
    let currentId = params.leagueId;
    if (!currentId) {
      const path = window.location.pathname;
      const parts = path.split('/');
      const index = parts.indexOf('bolao');
      if (index !== -1 && parts[index + 1]) currentId = parts[index + 1];
    }
    if (currentId) {
      setActiveLeagueId(currentId);
      localStorage.setItem('contextLeagueId', currentId);
    } else {
      if (location.pathname === '/' || location.pathname === '/criar-bolao') {
        setActiveLeagueId(null);
      } else {
        const saved = localStorage.getItem('contextLeagueId');
        if (saved) setActiveLeagueId(saved);
      }
    }
  }, [params.leagueId, location.pathname]);

  // 2. Verifica dono
  useEffect(() => {
    const checkOwner = async () => {
      if (activeLeagueId && user) {
        try {
          const docRef = doc(db, 'leagues', activeLeagueId);
          const docSnap = await getDoc(docRef);
          setIsLeagueOwner(docSnap.exists() && docSnap.data().ownerId === user.uid);
        } catch { setIsLeagueOwner(false); }
      } else { setIsLeagueOwner(false); }
    };
    checkOwner();
  }, [activeLeagueId, user]);

  useEffect(() => {
    const loadProfileName = async () => {
      if (!user) return;
      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        const storedName = userSnap.exists() ? userSnap.data().displayName : '';
        const nextName = storedName || user.displayName || '';
        setDisplayName(nextName);
        setNameInput(nextName);

        if (localStorage.getItem('showNamePrompt') === user.uid) {
          setIsNameModalOpen(true);
          localStorage.removeItem('showNamePrompt');
        }
      } catch (error) {
        console.error(error);
        setDisplayName(user.displayName || '');
        setNameInput(user.displayName || '');
      }
    };
    loadProfileName();
  }, [user]);

  // 3. Sincroniza Perfil
  useEffect(() => {
    const syncProfile = async () => {
      if (!user) return;
      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        const storedName = userSnap.exists() ? userSnap.data().displayName : '';
        const profileName = storedName || user.displayName || '';
        const membersRef = collectionGroup(db, 'members');
        const q = query(membersRef, where('uid', '==', user.uid));
        const querySnapshot = await getDocs(q);
        const batch = writeBatch(db);
        let updatesCount = 0;
        querySnapshot.forEach((docSnap) => {
          const memberData = docSnap.data();
          if (memberData.photoURL !== user.photoURL || memberData.displayName !== profileName) {
            batch.update(docSnap.ref, { photoURL: user.photoURL, displayName: profileName });
            updatesCount++;
          }
        });
        if (updatesCount > 0) await batch.commit();
      } catch (error) { console.error(error); }
    };
    syncProfile();
  }, [user]);

  const handleSaveName = async (event) => {
    event.preventDefault();
    if (!user || isSavingName) return;

    const trimmedName = nameInput.trim();
    if (trimmedName.length < 2) {
      setNameError('Informe um nome com pelo menos 2 caracteres.');
      return;
    }

    setIsSavingName(true);
    setNameError('');

    try {
      await updateProfile(user, { displayName: trimmedName });
      await setDoc(doc(db, 'users', user.uid), {
        displayName: trimmedName,
        email: user.email,
        photoURL: user.photoURL,
        updatedAt: new Date()
      }, { merge: true });

      const membersRef = collectionGroup(db, 'members');
      const q = query(membersRef, where('uid', '==', user.uid));
      const querySnapshot = await getDocs(q);
      const batch = writeBatch(db);
      querySnapshot.forEach((docSnap) => {
        batch.update(docSnap.ref, {
          displayName: trimmedName,
          photoURL: user.photoURL,
          email: user.email
        });
      });
      if (!querySnapshot.empty) await batch.commit();

      setDisplayName(trimmedName);
      setIsNameModalOpen(false);
      setIsProfileOpen(false);
    } catch (error) {
      console.error(error);
      setNameError('Não foi possível salvar o nome.');
    } finally {
      setIsSavingName(false);
    }
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem('contextLeagueId');
    navigate('/login');
    setIsOpen(false);
  };

  const closeMenu = () => {
    setIsOpen(false);
    setIsProfileOpen(false);
  };

  return (
    <nav className="navbar">
      {isNameModalOpen && user && (
        <div className="modal-overlay" onClick={() => setIsNameModalOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Editar nome</div>
            <form onSubmit={handleSaveName}>
              <label className="form-label" htmlFor="displayName">Nome exibido no bolão</label>
              <input
                id="displayName"
                className="form-input"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={40}
                autoFocus
              />
              {nameError && <p className="form-error">{nameError}</p>}
              <div className="modal-actions" style={{marginTop: '1rem'}}>
                <button type="button" onClick={() => setIsNameModalOpen(false)} className="btn-secondary" style={{border:'none'}}>
                  Agora não
                </button>
                <button type="submit" className="btn-sm btn-success" disabled={isSavingName}>
                  {isSavingName ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="nav-content">
        <Link to="/" className="nav-brand" onClick={closeMenu}>
          🏆 Bolão Copa
        </Link>
        
        <button className="menu-toggle" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? '✕' : '☰'}
        </button>

        <div className={`nav-links ${isOpen ? 'open' : ''}`}>
          
          {/* --- LINKS PRINCIPAIS (Esquerda) --- */}
          {activeLeagueId ? (
            <>
              <div className="nav-label-mobile" style={{color:'#94a3b8', fontSize:'0.7rem', textTransform:'uppercase', margin:'10px 0'}}>
                Menu do Bolão
              </div>

              <Link to={`/bolao/${activeLeagueId}`} onClick={closeMenu} className={`nav-link ${location.pathname === `/bolao/${activeLeagueId}` ? 'active' : ''}`}>
                Palpites
              </Link>
              
              <Link to={`/bolao/${activeLeagueId}/ranking`} onClick={closeMenu} className={`nav-link ${location.pathname.includes('/ranking') ? 'active' : ''}`}>
                Ranking
              </Link>

              <Link to={`/bolao/${activeLeagueId}/results`} onClick={closeMenu} className={`nav-link ${location.pathname.includes('/results') ? 'active' : ''}`}>
                Resultados
              </Link>

              {/* REMOVIDO DAQUI: O link "Participantes" saiu daqui */}
            </>
          ) : (
            <Link to="/" onClick={closeMenu} className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
              Meus Bolões
            </Link>
          )}

          <div style={{flex: 1}}></div>

          {/* --- MENU DE USUÁRIO (Direita) --- */}
          {user && (
            <div className="user-menu-container" ref={dropdownRef}>
              
              <button className="user-menu-btn" onClick={() => setIsProfileOpen(!isProfileOpen)}>
                <img src={user.photoURL} alt="User" referrerPolicy="no-referrer" className="nav-avatar-small"/>
                <span className="user-name-label">{displayName || user.displayName}</span>
                <span style={{color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem'}}>▼</span>
              </button>

              <div className="dropdown-menu" style={{ display: (isOpen || isProfileOpen) ? 'flex' : 'none' }}>
                
                {activeLeagueId && isLeagueOwner && (
                  <Link to={`/bolao/${activeLeagueId}/manage`} onClick={closeMenu} className="dropdown-item">
                    👤 Gerenciar Bolão
                  </Link>
                )}
                
                {isGlobalAdmin && (
                  <Link to="/admin" onClick={closeMenu} className="dropdown-item">
                    ⚙️ Painel Admin
                  </Link>
                )}

                {/* Divider 1 */}
                {(isLeagueOwner || isGlobalAdmin) && <div className="dropdown-divider"></div>}

                {activeLeagueId && (
                  <Link to="/" onClick={closeMenu} className="dropdown-item">
                    ⟲ Trocar de Bolão
                  </Link>
                )}

                {/* Divider 2: Garante espaçamento simétrico */}
                {activeLeagueId && <div className="dropdown-divider"></div>}

                <button
                  onClick={() => {
                    setNameInput(displayName || user.displayName || '');
                    setNameError('');
                    setIsNameModalOpen(true);
                  }}
                  className="dropdown-item"
                >
                  ✎ Editar nome
                </button>

                <div className="dropdown-divider"></div>

                {/* --- BOTÃO SAIR COM ÍCONE SVG --- */}
                <button onClick={handleLogout} className="dropdown-item logout">
                  {/* Ícone SVG "Log Out" */}
                  <svg 
                    width="18" 
                    height="18" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  Sair
                </button>

              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
