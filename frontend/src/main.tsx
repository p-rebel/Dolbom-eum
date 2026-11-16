import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyStoredFontSize } from './layout/SiteUtility';
import 'krds-uiux/resources/css/component/output.css';
import './styles.css';
import './features/registration/registration.css';

applyStoredFontSize();

createRoot(document.getElementById('root')!).render(<App />);
