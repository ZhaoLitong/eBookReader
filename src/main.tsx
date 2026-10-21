import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { registerOffline, registerPlatform } from './platform';
import './styles.css';

registerOffline();
void registerPlatform().catch(() => {});
createRoot(document.getElementById('root')!).render(<App />);
