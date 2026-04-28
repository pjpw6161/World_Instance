import './App.css'
import { EditorPage } from './pages/EditorPage'
import { WorldPage } from './pages/WorldPage'

function App() {
  const worldMatch = window.location.pathname.match(/^\/world\/([^/]+)$/);
  if (worldMatch?.[1]) {
    return <WorldPage worldInstanceId={decodeURIComponent(worldMatch[1])} />;
  }

  return <EditorPage />
}

export default App
