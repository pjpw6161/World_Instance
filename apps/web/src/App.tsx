import './App.css'
import { AuthPage } from './pages/AuthPage'
import { DashboardPage } from './pages/DashboardPage'
import { EditorPage } from './pages/EditorPage'
import { GalleryPage } from './pages/GalleryPage'
import { MapDetailPage } from './pages/MapDetailPage'
import { MapLibraryPage } from './pages/MapLibraryPage'
import { WorldPage } from './pages/WorldPage'

function App() {
  if (window.location.pathname === "/login") {
    return <AuthPage mode="login" />;
  }

  if (window.location.pathname === "/signup") {
    return <AuthPage mode="signup" />;
  }

  if (window.location.pathname === "/dashboard" || window.location.pathname === "/me/worlds") {
    return <DashboardPage />;
  }

  if (window.location.pathname === "/maps") {
    return <MapLibraryPage />;
  }

  const mapDetailMatch = window.location.pathname.match(/^\/maps\/([^/]+)$/);
  if (mapDetailMatch?.[1]) {
    return <MapDetailPage mapId={decodeURIComponent(mapDetailMatch[1])} />;
  }

  if (window.location.pathname === "/search" || window.location.pathname === "/gallery" || window.location.pathname === "/explore") {
    return <GalleryPage />;
  }

  const galleryMatch = window.location.pathname.match(/^\/(?:gallery|explore)\/([^/]+)$/);
  if (galleryMatch?.[1]) {
    return <MapDetailPage mapId={decodeURIComponent(galleryMatch[1])} />;
  }

  const worldMatch = window.location.pathname.match(/^\/world\/([^/]+)$/);
  if (worldMatch?.[1]) {
    return <WorldPage worldInstanceId={decodeURIComponent(worldMatch[1])} />;
  }

  return <EditorPage />
}

export default App
