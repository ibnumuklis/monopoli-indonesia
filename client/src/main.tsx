import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { useStore, navigate, getState } from './lib/store';
import { unlockAudio, startMusic } from './lib/audio';
import { Splash, Login } from './ui/Auth';
import { Shell, GlobalOverlays } from './ui/Shell';
import { Toasts } from './ui/common';
import { Lobby } from './ui/Lobby';
import { PlayMenu, RoomLobby } from './ui/Play';
import { Game } from './ui/Game';
import * as P from './ui/Pages';

const PAGES: Record<string, React.FC<any>> = {
  lobby: Lobby, play: PlayMenu, profile: P.Profile, collection: P.Collection, customize: P.Customize, shop: P.Shop,
  inventory: P.Inventory, missions: P.Missions, leaderboard: P.Leaderboard, events: P.Events, tournament: P.Tournament,
  adventure: P.Adventure, friends: P.Friends, guild: P.Guild, inbox: P.Inbox, settings: P.Settings,
};

function App() {
  const route = useStore((s) => s.route);
  const token = useStore((s) => s.token);
  useEffect(() => {
    const first = () => { unlockAudio(); if (getState().token) startMusic(); window.removeEventListener('pointerdown', first); };
    window.addEventListener('pointerdown', first);
    const h = location.hash.slice(1);
    if (h && PAGES[h]) getState().routeParams.initial = h;
  }, []);
  useEffect(() => { if (!token && !['splash', 'login'].includes(route)) navigate('login'); }, [token, route]);

  let content: React.ReactNode;
  if (route === 'splash') content = <Splash />;
  else if (route === 'login') content = <Login />;
  else if (route === 'game') content = <Game />;
  else if (route === 'room') content = <Shell><RoomLobby /></Shell>;
  else { const Page = PAGES[route] || Lobby; content = <Shell><Page /></Shell>; }
  return (
    <>
      <div className="world-bg" />
      {content}
      {!['splash', 'login'].includes(route) && <GlobalOverlays />}
      <Toasts />
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
