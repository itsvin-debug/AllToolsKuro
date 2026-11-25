import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './shared/config/apiConfig.js'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './shared/components/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
