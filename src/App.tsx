/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Users, 
  Clock, 
  Shield, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  LogOut, 
  Settings, 
  RefreshCw,
  Sword,
  UserPlus,
  MessageSquare
} from 'lucide-react';
import { 
  auth, 
  db, 
  loginWithGoogle, 
  logout, 
  onAuthStateChanged, 
  onSnapshot, 
  doc, 
  collection, 
  addDoc, 
  setDoc, 
  updateDoc, 
  getDocs, 
  query, 
  where, 
  serverTimestamp, 
  Timestamp,
  User,
  deleteDoc,
  handleFirestoreError,
  OperationType
} from './firebase';

// --- Types ---
interface Participante {
  id: string;
  username: string;
  createdAt: Timestamp;
}

interface GiveawayConfig {
  endDate?: Timestamp;
  winner?: string;
  winnerSelectedAt?: Timestamp;
}

// --- Components ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [logoClicks, setLogoClicks] = useState(0);
  
  const [username, setUsername] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [hasJoinedChannel, setHasJoinedChannel] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const [config, setConfig] = useState<GiveawayConfig | null>(null);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [timeLeft, setTimeLeft] = useState<{ d: number, h: number, m: number, s: number } | null>(null);

  // Admin Email from Context
  const ADMIN_EMAIL = "helpsamia@gmail.com";

  // --- Effects ---

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u && u.email === ADMIN_EMAIL && u.emailVerified) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
        setShowAdminPanel(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Listen to config
    const unsubConfig = onSnapshot(doc(db, 'config', 'giveaway'), (doc) => {
      if (doc.exists()) {
        setConfig(doc.data() as GiveawayConfig);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'config/giveaway');
    });

    // Listen to participants (only if admin or to check count)
    const unsubParticipantes = onSnapshot(collection(db, 'participantes'), (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Participante));
      setParticipantes(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'participantes');
    });

    return () => {
      unsubConfig();
      unsubParticipantes();
    };
  }, []);

  useEffect(() => {
    if (!config?.endDate) return;

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const end = config.endDate!.toDate().getTime();
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft({ d: 0, h: 0, m: 0, s: 0 });
        clearInterval(interval);
      } else {
        setTimeLeft({
          d: Math.floor(diff / (1000 * 60 * 60 * 24)),
          h: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          m: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
          s: Math.floor((diff % (1000 * 60)) / 1000)
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [config?.endDate]);

  // --- Handlers ---

  const handleLogoClick = () => {
    setLogoClicks(prev => {
      const next = prev + 1;
      if (next >= 5) {
        if (isAdmin) {
          setShowAdminPanel(true);
        } else {
          loginWithGoogle().catch(err => console.error("Login failed", err));
        }
        return 0;
      }
      return next;
    });
    // Reset clicks after 2 seconds of inactivity
    setTimeout(() => setLogoClicks(0), 2000);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !hasJoinedChannel) return;
    
    setIsRegistering(true);
    setMessage(null);

    try {
      // Check for duplicates
      const q = query(collection(db, 'participantes'), where('username', '==', username.trim()));
      const querySnapshot = await getDocs(q).catch(err => handleFirestoreError(err, OperationType.GET, 'participantes'));
      
      if (!querySnapshot || !querySnapshot.empty) {
        setMessage({ type: 'error', text: 'Este usuario ya está participando.' });
        setIsRegistering(false);
        return;
      }

      await addDoc(collection(db, 'participantes'), {
        username: username.trim(),
        createdAt: serverTimestamp()
      }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'participantes'));

      setMessage({ type: 'success', text: '¡Inscripción exitosa! Mucha suerte.' });
      setUsername('');
      setHasJoinedChannel(false);
    } catch (error) {
      console.error("Registration error:", error);
      setMessage({ type: 'error', text: 'Error al registrar. Inténtalo de nuevo.' });
    } finally {
      setIsRegistering(false);
    }
  };

  const pickWinner = async () => {
    if (participantes.length === 0) return;
    const randomIndex = Math.floor(Math.random() * participantes.length);
    const winner = participantes[randomIndex];

    try {
      await updateDoc(doc(db, 'config', 'giveaway'), {
        winner: winner.username,
        winnerSelectedAt: serverTimestamp()
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, 'config/giveaway'));
    } catch (error) {
      console.error("Error picking winner:", error);
    }
  };

  const setEndDate = async (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      await setDoc(doc(db, 'config', 'giveaway'), {
        endDate: Timestamp.fromDate(date)
      }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, 'config/giveaway'));
    } catch (error) {
      console.error("Error setting end date:", error);
    }
  };

  const resetGiveaway = async () => {
    if (!window.confirm("¿Estás seguro de reiniciar el sorteo? Se borrarán todos los participantes.")) return;
    
    try {
      // Clear participants (one by one for simplicity in this demo, but batch is better)
      const querySnapshot = await getDocs(collection(db, 'participantes')).catch(err => handleFirestoreError(err, OperationType.GET, 'participantes'));
      if (querySnapshot) {
        const deletePromises = querySnapshot.docs.map(d => deleteDoc(doc(db, 'participantes', d.id)).catch(err => handleFirestoreError(err, OperationType.DELETE, `participantes/${d.id}`)));
        await Promise.all(deletePromises);
      }

      // Reset config
      await setDoc(doc(db, 'config', 'giveaway'), {
        winner: null,
        winnerSelectedAt: null,
        endDate: null
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, 'config/giveaway'));
    } catch (error) {
      console.error("Error resetting giveaway:", error);
    }
  };

  // --- Render ---

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 space-y-8 max-w-4xl mx-auto">
      
      {/* Header */}
      <header className="text-center space-y-4 w-full">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={handleLogoClick}
          className="cursor-pointer inline-block"
        >
          <div className="w-24 h-24 bg-neon-red rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(255,49,49,0.5)] animate-pulse-neon">
            <Sword className="w-12 h-12 text-white" />
          </div>
        </motion.div>
        
        <motion.h1 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-4xl md:text-6xl font-extrabold tracking-tighter neon-text-red italic"
        >
          SORTEO MURDER MYSTERY 2 🔪
        </motion.h1>
        
        <p className="text-gray-400 font-medium">¡Participa y gana objetos exclusivos!</p>
      </header>

      {/* Countdown Timer */}
      {timeLeft && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-4 gap-4 w-full max-w-md"
        >
          {[
            { label: 'Días', value: timeLeft.d },
            { label: 'Hrs', value: timeLeft.h },
            { label: 'Min', value: timeLeft.m },
            { label: 'Seg', value: timeLeft.s }
          ].map((item, i) => (
            <div key={i} className="gaming-card p-3 text-center border-neon-red/30">
              <div className="text-2xl md:text-3xl font-bold font-mono neon-text-red">{item.value.toString().padStart(2, '0')}</div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{item.label}</div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Winner Section */}
      <AnimatePresence>
        {config?.winner && (
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className="w-full gaming-card p-8 text-center border-neon-purple relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-red via-neon-purple to-neon-blue"></div>
            <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4 animate-bounce" />
            <h2 className="text-2xl font-bold uppercase tracking-widest text-gray-300 mb-2">¡Tenemos un Ganador!</h2>
            <div className="text-4xl md:text-6xl font-black text-white drop-shadow-[0_0_15px_rgba(188,19,254,0.8)]">
              {config.winner}
            </div>
            <p className="mt-4 text-gray-400 text-sm italic">
              Seleccionado el {config.winnerSelectedAt?.toDate().toLocaleDateString()}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Registration Form */}
      {!config?.winner && (
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="w-full gaming-card p-6 md:p-10 space-y-8"
        >
          <form onSubmit={handleRegister} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-gray-500 font-bold ml-1">Usuario de Roblox</label>
              <input 
                type="text" 
                placeholder="Ej: RobloxPlayer123"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full p-4 rounded-lg neon-input text-lg font-bold"
                required
                disabled={isRegistering}
              />
            </div>

            <div className="flex items-center gap-3 p-4 rounded-lg bg-white/5 border border-white/10 hover:border-neon-blue/50 transition-colors cursor-pointer group" onClick={() => setHasJoinedChannel(!hasJoinedChannel)}>
              <div className={`w-6 h-6 rounded flex items-center justify-center border-2 transition-all ${hasJoinedChannel ? 'bg-neon-blue border-neon-blue' : 'border-gray-600 group-hover:border-neon-blue'}`}>
                {hasJoinedChannel && <CheckCircle2 className="w-4 h-4 text-white" />}
              </div>
              <span className="text-sm text-gray-300 font-medium select-none">Me he unido al canal de WhatsApp (Obligatorio)</span>
            </div>
            
            <button 
              type="submit"
              disabled={isRegistering || !hasJoinedChannel}
              className="w-full p-4 rounded-lg neon-button-red font-black text-xl uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isRegistering ? (
                <RefreshCw className="w-6 h-6 animate-spin" />
              ) : (
                <>Participar <Sword className="w-6 h-6" /></>
              )}
            </button>
            {!hasJoinedChannel && (
              <p className="text-[10px] text-center text-neon-blue animate-pulse font-bold uppercase tracking-widest">Debes unirte al canal para participar</p>
            )}
          </form>

          {message && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`p-4 rounded-lg flex items-center gap-3 ${
                message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'
              }`}
            >
              {message.type === 'success' ? <CheckCircle2 className="shrink-0" /> : <AlertCircle className="shrink-0" />}
              <span className="font-medium">{message.text}</span>
            </motion.div>
          )}

          <div className="space-y-4 pt-4 border-t border-white/5">
            <h3 className="text-sm font-bold uppercase tracking-widest text-neon-blue">Requisitos Obligatorios:</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3 text-gray-300">
                <div className="w-6 h-6 rounded-full bg-neon-blue/20 flex items-center justify-center shrink-0 mt-0.5">
                  <UserPlus className="w-3.5 h-3.5 text-neon-blue" />
                </div>
                <span>Enviar solicitud de amistad a: <strong className="text-white">NARU_SAMTRADE</strong></span>
              </li>
              <li className="flex items-start gap-3 text-gray-300">
                <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <MessageSquare className="w-3.5 h-3.5 text-green-400" />
                </div>
                <div className="flex flex-col">
                  <span>Seguir el canal de WhatsApp:</span>
                  <a 
                    href="https://whatsapp.com/channel/0029Vb7lwDNDjiOaZDFLZB2A" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-neon-blue hover:underline flex items-center gap-1 mt-1 font-bold"
                  >
                    Abrir Canal <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </li>
            </ul>
          </div>
        </motion.div>
      )}

      {/* Footer Stats */}
      <div className="flex gap-8 text-gray-500 text-xs font-bold uppercase tracking-widest">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4" />
          <span>{participantes.length} Participantes</span>
        </div>
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4" />
          <span>Sorteo Verificado</span>
        </div>
      </div>

      {/* Admin Panel Modal */}
      <AnimatePresence>
        {showAdminPanel && isAdmin && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-2xl gaming-card p-6 md:p-8 space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <Settings className="w-6 h-6 text-neon-purple" />
                  <h2 className="text-xl font-black uppercase tracking-tighter">Panel de Administración</h2>
                </div>
                <button onClick={() => setShowAdminPanel(false)} className="text-gray-500 hover:text-white">
                  <RefreshCw className="w-6 h-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Actions */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Acciones Rápidas</h3>
                  <button 
                    onClick={pickWinner}
                    disabled={participantes.length === 0}
                    className="w-full p-4 rounded-lg bg-neon-purple text-white font-bold flex items-center justify-center gap-2 hover:bg-neon-purple/80 transition-colors disabled:opacity-50"
                  >
                    <Trophy className="w-5 h-5" /> Elegir Ganador Aleatorio
                  </button>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Fecha de Cierre</label>
                    <input 
                      type="datetime-local" 
                      className="w-full p-3 rounded bg-white/5 border border-white/10 text-sm"
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>

                  <button 
                    onClick={resetGiveaway}
                    className="w-full p-3 rounded-lg border border-red-500/50 text-red-500 text-xs font-bold uppercase tracking-widest hover:bg-red-500/10 transition-colors"
                  >
                    Reiniciar Sorteo
                  </button>

                  <button 
                    onClick={logout}
                    className="w-full p-3 rounded-lg bg-white/5 text-gray-400 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:text-white transition-colors"
                  >
                    <LogOut className="w-4 h-4" /> Cerrar Sesión
                  </button>
                </div>

                {/* Participants List */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Participantes ({participantes.length})</h3>
                  <div className="bg-black/40 rounded-lg border border-white/5 h-64 overflow-y-auto p-2 space-y-1">
                    {participantes.map((p, i) => (
                      <div key={p.id} className="flex items-center justify-between p-2 rounded hover:bg-white/5 text-sm">
                        <span className="font-mono text-gray-300">{i + 1}. {p.username}</span>
                        <span className="text-[10px] text-gray-600">{p.createdAt?.toDate().toLocaleDateString()}</span>
                      </div>
                    ))}
                    {participantes.length === 0 && (
                      <div className="h-full flex items-center justify-center text-gray-600 text-xs italic">
                        No hay participantes aún
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
