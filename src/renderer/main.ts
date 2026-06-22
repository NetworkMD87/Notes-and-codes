import type { Api } from '../shared/types'
declare global { interface Window { api: Api } }

const root = document.getElementById('app')
if (root) root.textContent = 'Notes & Codes ready.'
