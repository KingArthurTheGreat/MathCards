import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { StoreProvider } from './hooks/useStore';
import './styles.css';
import 'katex/dist/katex.min.css';
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="loading">
        <h1>Не удалось отобразить экран</h1>
        <p>Сохранённые данные остаются в базе. Перезапустите приложение.</p>
        <button onClick={() => location.reload()}>Перезапустить интерфейс</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
if (import.meta.env.MODE === 'mobile') {
  const { installMobileBridge } = await import('./mobile/bridge');
  installMobileBridge();
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <StoreProvider>
        <App />
      </StoreProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
