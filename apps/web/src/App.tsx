import './App.css'
import { AuthPage } from './pages/AuthPage'
import { EditorPage } from './pages/EditorPage'
import { MapLibraryPage } from './pages/MapLibraryPage'
import { SearchPage } from './pages/SearchPage'
import { WorldPage } from './pages/WorldPage'

function App() {
  if (window.location.pathname === "/login") {
    return <AuthPage mode="login" />;
  }

  if (window.location.pathname === "/signup") {
    return <AuthPage mode="signup" />;
  }

  if (window.location.pathname === "/maps") {
    return <MapLibraryPage />;
  }

  if (window.location.pathname === "/search") {
    return <SearchPage />;
  }

  const worldMatch = window.location.pathname.match(/^\/world\/([^/]+)$/);
  if (worldMatch?.[1]) {
    return <WorldPage worldInstanceId={decodeURIComponent(worldMatch[1])} />;
  }

  return <EditorPage />
}

export default App
