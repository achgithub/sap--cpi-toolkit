import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@ui5/webcomponents-react'
import '@ui5/webcomponents-react/dist/Assets.js'
import '@ui5/webcomponents-icons/dist/AllIcons.js'
import './index.css'
import App from './App'
import { CPIInstanceProvider } from './context/CPIInstanceContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <CPIInstanceProvider>
        <App />
      </CPIInstanceProvider>
    </ThemeProvider>
  </StrictMode>,
)
