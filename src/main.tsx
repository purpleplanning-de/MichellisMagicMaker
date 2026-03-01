import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import SmartTodoInbox from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SmartTodoInbox />
  </StrictMode>,
)
