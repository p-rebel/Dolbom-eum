import { createRoot } from 'react-dom/client';
import { App } from './App';
import 'krds-uiux/resources/css/component/output.css';
import './styles.css';
import './features/registration/registration.css';

createRoot(document.getElementById('root')!).render(<App />);
